#!/usr/bin/env python3
"""
One-Time Safe Legacy Migration Script (scripts/migrate_legacy.py)
=================================================================
Imports historical correspondence records, manually typed Arabic descriptions
(legacyNotes), and local PDF files from the existing on-premise Microsoft SQL
Server (.aspx archive) into Cloud Firestore and Firebase Storage.

NON-NEGOTIABLE DATA SAFETY GUARANTEES:
1. STRICTLY READ-ONLY on Legacy SQL Server: Executes ONLY SELECT statements.
   Never runs INSERT, UPDATE, DELETE, DROP, or TRUNCATE against SQL Server.
2. STRICTLY READ-ONLY on Legacy Uploads Folder: Never modifies, moves, or
   deletes any local PDF file.
3. CLEAN ARABIC DECODING: Safely decodes legacy cp1256 / windows-1256 VARCHAR
   columns (as well as NVARCHAR/UTF-8) so historical Arabic text imports with
   100% accuracy.
4. IDEMPOTENT & RESUMABLE: Checks existing `legacyId` values in Firestore so
   re-running after an interruption never creates duplicate records.

Usage:
    python scripts/migrate_legacy.py --dry-run --limit 20
    python scripts/migrate_legacy.py
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import firebase_admin
from firebase_admin import credentials, firestore, storage
from dotenv import load_dotenv

try:
    import pyodbc
except ImportError:
    pyodbc = None  # type: ignore[assignment]

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("migrate_legacy")

# ---------------------------------------------------------------------------
# Arabic Text & Digit Normalization Helpers
# ---------------------------------------------------------------------------
ARABIC_DIGITS_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
TASHKEEL_RE = re.compile(r"[\u064B-\u065F\u0670\u0640]")
TOKEN_SPLIT_RE = re.compile(r"[\s,،؛;:()\[\]{}\"'«»!?|]+")


def decode_legacy_arabic(value: Any) -> str:
    """Safely decodes legacy SQL Server VARCHAR (cp1256 / windows-1256) or NVARCHAR."""
    if value is None:
        return ""
    if isinstance(value, bytes):
        for enc in ("cp1256", "utf-8", "utf-16-le", "latin-1"):
            try:
                return value.decode(enc).strip()
            except UnicodeDecodeError:
                continue
        return value.decode("cp1256", errors="replace").strip()

    text = str(value).strip()
    if not text:
        return ""

    # Detect mojibake where cp1256 bytes were erroneously decoded as latin-1 / cp1252
    if any("\u00c0" <= ch <= "\u00ff" for ch in text) and not any(
        "\u0600" <= ch <= "\u06ff" for ch in text
    ):
        try:
            recovered = text.encode("latin-1").decode("cp1256")
            if any("\u0600" <= ch <= "\u06ff" for ch in recovered):
                return recovered.strip()
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass

    return text


def to_ascii_digits(text: str) -> str:
    return text.translate(ARABIC_DIGITS_MAP)


def normalize_arabic_text(text: str) -> str:
    if not text:
        return ""
    cleaned = unicodedata.normalize("NFKC", to_ascii_digits(text))
    cleaned = TASHKEEL_RE.sub("", cleaned)
    cleaned = cleaned.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    cleaned = cleaned.replace("ة", "ه").replace("ى", "ي")
    return cleaned.lower().strip()


def normalize_date(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    raw = to_ascii_digits(decode_legacy_arabic(value))
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[/\\?%*:|"<>]', "_", name)
    cleaned = re.sub(r"\s+", "_", cleaned).strip()
    return cleaned or "legacy_document.pdf"


def build_search_keywords(doc_fields: Dict[str, Any]) -> List[str]:
    keywords: Set[str] = set()

    for ref_key in (
        "saderNumber",
        "saderDate",
        "waredNumber",
        "waredDate",
        "externalSaderNumber",
        "externalSaderDate",
    ):
        val = doc_fields.get(ref_key)
        if val:
            norm = normalize_arabic_text(str(val))
            if len(norm) >= 2:
                keywords.add(norm)
            for part in re.split(r"[/\-_.\s]+", to_ascii_digits(str(val))):
                if len(part) >= 2:
                    keywords.add(part.lower())

    for text_key in (
        "subject",
        "entityName",
        "documentType",
        "folderName",
        "summary",
        "legacyNotes",
        "fullText",
    ):
        val = doc_fields.get(text_key)
        if not val:
            continue
        norm = normalize_arabic_text(str(val))
        for tok in TOKEN_SPLIT_RE.split(norm):
            tok = tok.strip("-_./")
            if len(tok) < 2:
                continue
            keywords.add(tok)
            if tok.startswith("ال") and len(tok) > 4:
                keywords.add(tok[2:])
            if len(keywords) >= 60:
                return list(keywords)[:60]

    return list(keywords)[:60]


def inspect_pdf_pages_and_text(pdf_path: Path) -> tuple[int, str]:
    """Reads page count and any embedded text layer from a local PDF without modifying it."""
    if PdfReader is None or not pdf_path.is_file():
        return 1, ""
    try:
        reader = PdfReader(str(pdf_path))
        page_count = max(1, len(reader.pages))
        extracted_chunks: List[str] = []
        for page in reader.pages[:25]:
            txt = page.extract_text() or ""
            if txt.strip():
                extracted_chunks.append(txt.strip())
        return page_count, "\n\n".join(extracted_chunks)[:100000]
    except Exception as exc:
        logger.warning("Could not parse PDF %s: %s", pdf_path.name, exc)
        return 1, ""


# ---------------------------------------------------------------------------
# Database & Firebase Initialization
# ---------------------------------------------------------------------------
def connect_sql_server() -> "pyodbc.Connection":
    if pyodbc is None:
        raise RuntimeError("pyodbc is not installed. Run: pip install -r scripts/requirements.txt")

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

    conn = pyodbc.connect(conn_str, readonly=True)
    # Configure cp1256 decoding for legacy non-Unicode VARCHAR columns
    conn.setdecoding(pyodbc.SQL_CHAR, encoding="cp1256")
    conn.setdecoding(pyodbc.SQL_WCHAR, encoding="utf-16le")
    return conn


def init_firebase() -> tuple[Any, Any]:
    service_account = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "")
    if not service_account or not os.path.isfile(service_account):
        raise FileNotFoundError(
            f"Firebase service account JSON not found at: {service_account}"
        )
    if not bucket_name:
        raise ValueError("FIREBASE_STORAGE_BUCKET is required in scripts/.env")

    if not firebase_admin._apps:
        cred = credentials.Certificate(service_account)
        firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})

    return firestore.client(), storage.bucket()


def load_existing_legacy_ids(db: Any) -> Set[int]:
    existing: Set[int] = set()
    docs = db.collection("documents").where("legacyId", "!=", None).select(["legacyId"]).stream()
    for doc in docs:
        lid = doc.to_dict().get("legacyId")
        if isinstance(lid, int):
            existing.add(lid)
    return existing


def map_direction(raw_direction: str) -> str:
    norm = normalize_arabic_text(raw_direction)
    if any(k in norm for k in ("wared", "وارد", "outgoing", "out", "2")):
        return "wared"
    return "sader"


# ---------------------------------------------------------------------------
# Main Migration Routine
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Safe read-only migration from Legacy SQL Server (.aspx) to Firebase."
    )
    parser.add_argument(
        "--env",
        default=str(Path(__file__).parent / ".env"),
        help="Path to .env file (default: scripts/.env)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read SQL Server and verify Arabic decoding + PDF paths without writing to Firebase.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional maximum number of rows to process (0 = all rows).",
    )
    args = parser.parse_args()

    load_dotenv(args.env)

    table_name = os.getenv("LEGACY_TABLE_NAME", "dbo.ArchiveDocuments")
    uploads_dir = Path(os.getenv("LEGACY_UPLOADS_DIR", r"C:\inetpub\wwwroot\ArchiveApp\Uploads"))

    # Configurable SQL column mapping to match any legacy .aspx table schema
    col_id = os.getenv("COL_ID", "Id")
    col_direction = os.getenv("COL_DIRECTION", "Direction")
    col_sader_num = os.getenv("COL_SADER_NUMBER", "SaderNumber")
    col_sader_date = os.getenv("COL_SADER_DATE", "SaderDate")
    col_wared_num = os.getenv("COL_WARED_NUMBER", "WaredNumber")
    col_wared_date = os.getenv("COL_WARED_DATE", "WaredDate")
    col_ext_num = os.getenv("COL_EXTERNAL_SADER_NUMBER", "ExternalSaderNumber")
    col_ext_date = os.getenv("COL_EXTERNAL_SADER_DATE", "ExternalSaderDate")
    col_subject = os.getenv("COL_SUBJECT", "Subject")
    col_entity = os.getenv("COL_ENTITY_NAME", "EntityName")
    col_doc_type = os.getenv("COL_DOCUMENT_TYPE", "DocumentType")
    col_folder = os.getenv("COL_FOLDER_NAME", "FolderName")
    col_notes = os.getenv("COL_LEGACY_NOTES", "Notes")
    col_pdf_file = os.getenv("COL_PDF_FILENAME", "PdfFileName")

    # Validate SQL identifier safety (prevent accidental injection from misconfigured .env)
    ident_re = re.compile(r"^[A-Za-z0-9_.\[\]]+$")
    for ident in (
        table_name,
        col_id,
        col_direction,
        col_sader_num,
        col_sader_date,
        col_wared_num,
        col_wared_date,
        col_ext_num,
        col_ext_date,
        col_subject,
        col_entity,
        col_doc_type,
        col_folder,
        col_notes,
        col_pdf_file,
    ):
        if not ident_re.match(ident):
            raise ValueError(f"Unsafe SQL identifier in configuration: {ident}")

    top_clause = f"TOP ({args.limit}) " if args.limit and args.limit > 0 else ""
    select_sql = (
        f"SELECT {top_clause}"
        f"{col_id}, {col_direction}, {col_sader_num}, {col_sader_date}, "
        f"{col_wared_num}, {col_wared_date}, {col_ext_num}, {col_ext_date}, "
        f"{col_subject}, {col_entity}, {col_doc_type}, {col_folder}, "
        f"{col_notes}, {col_pdf_file} "
        f"FROM {table_name} ORDER BY {col_id} ASC"
    )

    logger.info("Connecting to Legacy SQL Server (READ-ONLY mode)...")
    conn = connect_sql_server()
    cursor = conn.cursor()
    cursor.execute(select_sql)
    rows = cursor.fetchall()
    logger.info("Fetched %d historical records from %s.", len(rows), table_name)

    db = None
    bucket = None
    existing_ids: Set[int] = set()

    if not args.dry_run:
        db, bucket = init_firebase()
        existing_ids = load_existing_legacy_ids(db)
        logger.info("Found %d already-migrated legacy records in Firestore.", len(existing_ids))
    else:
        logger.info("DRY-RUN MODE ENABLED: No data will be written to Firebase.")

    migrated = 0
    skipped = 0
    missing_pdfs = 0

    for row in rows:
        legacy_id = int(row[0])
        if legacy_id in existing_ids:
            skipped += 1
            continue

        direction = map_direction(decode_legacy_arabic(row[1]))
        sader_num = to_ascii_digits(decode_legacy_arabic(row[2])) or None
        sader_date = normalize_date(row[3])
        wared_num = to_ascii_digits(decode_legacy_arabic(row[4])) or None
        wared_date = normalize_date(row[5])
        ext_num = to_ascii_digits(decode_legacy_arabic(row[6])) or None
        ext_date = normalize_date(row[7])

        subject = decode_legacy_arabic(row[8]) or f"مستند أرشيف قديم #{legacy_id}"
        entity_name = decode_legacy_arabic(row[9]) or "جهة غير محددة"
        doc_type = decode_legacy_arabic(row[10]) or "خطاب رسمي"
        folder_name = decode_legacy_arabic(row[11]) or "الأرشيف القديم"
        legacy_notes = decode_legacy_arabic(row[12])
        pdf_rel = decode_legacy_arabic(row[13])

        pdf_path = uploads_dir / Path(pdf_rel).name if pdf_rel else None
        has_pdf = bool(pdf_path and pdf_path.is_file())
        if not has_pdf:
            missing_pdfs += 1

        page_count, full_text = (
            inspect_pdf_pages_and_text(pdf_path) if has_pdf and pdf_path else (1, "")
        )

        if args.dry_run:
            logger.info(
                "[DRY-RUN] legacyId=%d | dir=%s | subject=%s | entity=%s | pdf=%s (%s)",
                legacy_id,
                direction,
                subject[:50],
                entity_name[:30],
                pdf_rel or "NONE",
                "OK" if has_pdf else "MISSING",
            )
            migrated += 1
            continue

        assert db is not None and bucket is not None

        storage_path = ""
        pdf_url = ""
        orig_filename = Path(pdf_rel).name if pdf_rel else f"legacy_{legacy_id}.pdf"

        if has_pdf and pdf_path:
            safe_name = sanitize_filename(orig_filename)
            storage_path = f"archive/legacy/{legacy_id}_{safe_name}"
            blob = bucket.blob(storage_path)
            blob.upload_from_filename(str(pdf_path), content_type="application/pdf")
            blob.make_public()
            pdf_url = blob.public_url

        doc_payload: Dict[str, Any] = {
            "direction": direction,
            "saderNumber": sader_num if direction == "sader" else None,
            "saderDate": sader_date if direction == "sader" else None,
            "waredNumber": wared_num if direction == "wared" else None,
            "waredDate": wared_date if direction == "wared" else None,
            "externalSaderNumber": ext_num if direction == "wared" else None,
            "externalSaderDate": ext_date if direction == "wared" else None,
            "subject": subject,
            "summary": legacy_notes[:400] if legacy_notes else subject,
            "entityName": entity_name,
            "documentType": doc_type,
            "folderName": folder_name,
            "legacyNotes": legacy_notes,
            "fullText": full_text,
            "storagePath": storage_path,
            "pdfUrl": pdf_url,
            "originalFilename": orig_filename,
            "pageCount": page_count,
            "aiExtractedFields": [],
            "createdBy": {
                "uid": "legacy-migration",
                "name": "الترحيل من الأرشيف القديم",
                "email": "migration@system.local",
            },
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "syncedToLegacy": True,
            "legacyId": legacy_id,
        }
        doc_payload["searchKeywords"] = build_search_keywords(doc_payload)

        db.collection("documents").add(doc_payload)
        migrated += 1

        if migrated % 25 == 0:
            logger.info("Progress: %d migrated, %d skipped...", migrated, skipped)

    conn.close()
    logger.info(
        "Migration finished. Processed=%d | Skipped(already existed)=%d | MissingPDFs=%d",
        migrated,
        skipped,
        missing_pdfs,
    )


if __name__ == "__main__":
    main()

