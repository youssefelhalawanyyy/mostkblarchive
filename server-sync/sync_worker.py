#!/usr/bin/env python3
"""
24/7 Windows Server Real-Time Sync Worker (server-sync/sync_worker.py)
======================================================================
Listens in real time to Cloud Firestore (`on_snapshot`) for newly archived
documents where `syncedToLegacy == False`. For each new document:
  1. Downloads the PDF from Firebase Storage into the legacy `.aspx` server's
     local `Uploads` directory using a collision-proof `{docId}_` prefix
     (NEVER overwrites or deletes existing files).
  2. Executes a strictly APPEND-ONLY parameterized `INSERT` into local Microsoft
     SQL Server (NEVER runs UPDATE, DELETE, DROP, or TRUNCATE on SQL Server).
  3. Updates ONLY the Cloud Firestore document with `syncedToLegacy = True`,
     `legacyId = <inserted_sql_id>`, and `syncedAt = SERVER_TIMESTAMP`.

Designed to run 24/7 as a Windows Service via NSSM (`install_service.bat`).
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
import os
import re
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional, Set

import firebase_admin
from firebase_admin import credentials, firestore, storage
from dotenv import load_dotenv

try:
    import pyodbc
except ImportError:
    pyodbc = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Global Shutdown & Deduplication State
# ---------------------------------------------------------------------------
STOP_EVENT = threading.Event()
PROCESSING_LOCK = threading.Lock()
IN_FLIGHT_DOC_IDS: Set[str] = set()

IDENT_RE = re.compile(r"^[A-Za-z0-9_.\[\]]+$")


def setup_logging(log_dir: Path) -> logging.Logger:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "sync_worker.log"

    logger = logging.getLogger("sync_worker")
    logger.setLevel(logging.INFO)

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

    file_handler = RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)
    return logger


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[/\\?%*:|"<>]', "_", name or "document.pdf")
    cleaned = re.sub(r"\s+", "_", cleaned).strip()
    return cleaned or "document.pdf"


def validate_sql_ident(name: str) -> str:
    if not IDENT_RE.match(name):
        raise ValueError(f"Unsafe SQL identifier configured: {name}")
    return name


def get_sql_connection() -> "pyodbc.Connection":
    if pyodbc is None:
        raise RuntimeError(
            "pyodbc is not installed. Run: pip install -r server-sync/requirements.txt"
        )

    driver = os.getenv("SQL_DRIVER", "{ODBC Driver 17 for SQL Server}")
    server = os.getenv("SQL_SERVER", "localhost\\SQLEXPRESS")
    database = os.getenv("SQL_DATABASE", "LegacyArchiveDB")
    trusted = os.getenv("SQL_TRUSTED_CONNECTION", "yes").lower() in ("yes", "true", "1")

    if trusted:
        conn_str = (
            f"DRIVER={driver};SERVER={server};DATABASE={database};"
            "Trusted_Connection=yes;TrustServerCertificate=yes;"
        )
    else:
        username = os.getenv("SQL_USERNAME", "")
        password = os.getenv("SQL_PASSWORD", "")
        conn_str = (
            f"DRIVER={driver};SERVER={server};DATABASE={database};"
            f"UID={username};PWD={password};TrustServerCertificate=yes;"
        )

    return pyodbc.connect(conn_str, autocommit=False)


def download_pdf_no_overwrite(
    bucket: Any,
    storage_path: str,
    uploads_dir: Path,
    doc_id: str,
    original_filename: str,
    logger: logging.Logger,
) -> str:
    """
    Downloads the PDF into `{uploads_dir}/{doc_id}_{safe_filename}`.
    Strictly guarantees that existing files are NEVER overwritten or deleted.
    """
    uploads_dir.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(original_filename)
    target_filename = f"{doc_id}_{safe_name}"
    target_path = uploads_dir / target_filename

    if target_path.exists():
        logger.info(
            "File %s already exists in Uploads — preserving existing file (no-overwrite).",
            target_filename,
        )
        return target_filename

    if not storage_path:
        raise ValueError(f"Document {doc_id} has empty storagePath.")

    blob = bucket.blob(storage_path)
    tmp_path = uploads_dir / f".{target_filename}.part"
    try:
        blob.download_to_filename(str(tmp_path))
        # Final check before atomic rename to guarantee zero overwrite
        if not target_path.exists():
            os.replace(tmp_path, target_path)
        else:
            tmp_path.unlink(missing_ok=True)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    logger.info("Downloaded PDF safely to %s", target_path)
    return target_filename


def append_only_sql_insert(
    doc_data: Dict[str, Any],
    local_pdf_filename: str,
) -> Optional[int]:
    """
    Performs a strictly APPEND-ONLY parameterized INSERT into local SQL Server.
    NEVER executes UPDATE, DELETE, DROP, or TRUNCATE.
    """
    table_name = validate_sql_ident(os.getenv("LEGACY_TABLE_NAME", "dbo.ArchiveDocuments"))
    col_id = validate_sql_ident(os.getenv("COL_ID", "Id"))
    col_direction = validate_sql_ident(os.getenv("COL_DIRECTION", "Direction"))
    col_sader_num = validate_sql_ident(os.getenv("COL_SADER_NUMBER", "SaderNumber"))
    col_sader_date = validate_sql_ident(os.getenv("COL_SADER_DATE", "SaderDate"))
    col_wared_num = validate_sql_ident(os.getenv("COL_WARED_NUMBER", "WaredNumber"))
    col_wared_date = validate_sql_ident(os.getenv("COL_WARED_DATE", "WaredDate"))
    col_ext_num = validate_sql_ident(os.getenv("COL_EXTERNAL_SADER_NUMBER", "ExternalSaderNumber"))
    col_ext_date = validate_sql_ident(os.getenv("COL_EXTERNAL_SADER_DATE", "ExternalSaderDate"))
    col_subject = validate_sql_ident(os.getenv("COL_SUBJECT", "Subject"))
    col_entity = validate_sql_ident(os.getenv("COL_ENTITY_NAME", "EntityName"))
    col_doc_type = validate_sql_ident(os.getenv("COL_DOCUMENT_TYPE", "DocumentType"))
    col_folder = validate_sql_ident(os.getenv("COL_FOLDER_NAME", "FolderName"))
    col_notes = validate_sql_ident(os.getenv("COL_LEGACY_NOTES", "Notes"))
    col_pdf_file = validate_sql_ident(os.getenv("COL_PDF_FILENAME", "PdfFileName"))

    insert_sql = (
        f"INSERT INTO {table_name} ("
        f"{col_direction}, {col_sader_num}, {col_sader_date}, "
        f"{col_wared_num}, {col_wared_date}, {col_ext_num}, {col_ext_date}, "
        f"{col_subject}, {col_entity}, {col_doc_type}, {col_folder}, "
        f"{col_notes}, {col_pdf_file}"
        f") OUTPUT INSERTED.{col_id} "
        f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )

    direction_ar = "صادر" if doc_data.get("direction") == "sader" else "وارد"
    combined_notes = doc_data.get("legacyNotes") or doc_data.get("summary") or ""

    params = (
        direction_ar,
        doc_data.get("saderNumber"),
        doc_data.get("saderDate"),
        doc_data.get("waredNumber"),
        doc_data.get("waredDate"),
        doc_data.get("externalSaderNumber"),
        doc_data.get("externalSaderDate"),
        doc_data.get("subject") or "",
        doc_data.get("entityName") or "",
        doc_data.get("documentType") or "",
        doc_data.get("folderName") or "",
        combined_notes,
        local_pdf_filename,
    )

    conn = get_sql_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(insert_sql, params)
        row = cursor.fetchone()
        conn.commit()
        return int(row[0]) if row and row[0] is not None else None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def process_document(
    doc_snapshot: Any,
    db: Any,
    bucket: Any,
    uploads_dir: Path,
    logger: logging.Logger,
) -> None:
    doc_id = doc_snapshot.id
    with PROCESSING_LOCK:
        if doc_id in IN_FLIGHT_DOC_IDS:
            return
        IN_FLIGHT_DOC_IDS.add(doc_id)

    try:
        data = doc_snapshot.to_dict() or {}
        if data.get("syncedToLegacy") is True:
            return

        logger.info(
            "Syncing new document docId=%s | direction=%s | subject=%s",
            doc_id,
            data.get("direction"),
            str(data.get("subject", ""))[:60],
        )

        # 1. Download PDF to legacy Uploads folder (collision-proof, no overwrite)
        local_pdf_filename = download_pdf_no_overwrite(
            bucket=bucket,
            storage_path=str(data.get("storagePath") or ""),
            uploads_dir=uploads_dir,
            doc_id=doc_id,
            original_filename=str(data.get("originalFilename") or "document.pdf"),
            logger=logger,
        )

        # 2. Append-only INSERT into local SQL Server
        inserted_legacy_id = append_only_sql_insert(data, local_pdf_filename)
        logger.info(
            "Append-only SQL INSERT succeeded for docId=%s -> legacyId=%s",
            doc_id,
            inserted_legacy_id,
        )

        # 3. Mark synced in Firestore ONLY
        db.collection("documents").document(doc_id).update(
            {
                "syncedToLegacy": True,
                "legacyId": inserted_legacy_id,
                "syncedAt": firestore.SERVER_TIMESTAMP,
            }
        )
        logger.info("Marked docId=%s as syncedToLegacy=True in Firestore.", doc_id)

    except Exception as exc:
        logger.exception("Failed to sync docId=%s: %s", doc_id, exc)
    finally:
        with PROCESSING_LOCK:
            IN_FLIGHT_DOC_IDS.discard(doc_id)


def init_firebase() -> tuple[Any, Any]:
    service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "")
    if not service_account or not os.path.isfile(service_account):
        raise FileNotFoundError(
            f"Firebase service account JSON not found at: {service_account}"
        )
    if not bucket_name:
        raise ValueError("FIREBASE_STORAGE_BUCKET is required in server-sync/.env")

    if not firebase_admin._apps:
        cred = credentials.Certificate(service_account)
        firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})

    return firestore.client(), storage.bucket()


def handle_signal(signum: int, _frame: Any) -> None:
    STOP_EVENT.set()


def main() -> None:
    base_dir = Path(__file__).parent
    load_dotenv(base_dir / ".env")
    logger = setup_logging(base_dir / "logs")

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    uploads_dir = Path(
        os.getenv("LEGACY_UPLOADS_DIR", r"C:\inetpub\wwwroot\ArchiveApp\Uploads")
    )

    logger.info("Starting 24/7 Legacy Sync Worker (append-only SQL Server mode)...")
    db, bucket = init_firebase()

    def on_snapshot(col_snapshot: Any, changes: Any, _read_time: Any) -> None:
        for change in changes:
            if change.type.name in ("ADDED", "MODIFIED"):
                doc_snap = change.document
                # Process in a daemon worker thread so the Firestore gRPC listener stays responsive
                threading.Thread(
                    target=process_document,
                    args=(doc_snap, db, bucket, uploads_dir, logger),
                    daemon=True,
                ).start()

    while not STOP_EVENT.is_set():
        watch = None
        try:
            query = db.collection("documents").where("syncedToLegacy", "==", False)
            watch = query.on_snapshot(on_snapshot)
            logger.info("Listening to Firestore (syncedToLegacy == False) in real time...")

            while not STOP_EVENT.is_set():
                time.sleep(2)
        except Exception as exc:
            logger.exception("Firestore listener error, reconnecting in 10s: %s", exc)
            time.sleep(10)
        finally:
            if watch is not None:
                try:
                    watch.unsubscribe()
                except Exception:
                    pass

    logger.info("Sync Worker stopped gracefully.")


if __name__ == "__main__":
    main()

