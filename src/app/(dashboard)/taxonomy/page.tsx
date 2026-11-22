"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Folder, Building2, FileType, Plus, Loader2, ArrowUpLeft } from "lucide-react";
import {
  fetchTaxonomy,
  upsertDocumentType,
  upsertEntity,
  upsertFolder,
} from "@/lib/archive/queries";
import type { DocumentTypeItem, EntityItem, FolderItem } from "@/lib/types";
import { LtrCode } from "@/components/ui/LtrCode";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { useAuth } from "@/context/AuthContext";

type TabId = "folders" | "entities" | "types";

export default function TaxonomyPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const [tab, setTab] = useState<TabId>("folders");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [types, setTypes] = useState<DocumentTypeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newExtra, setNewExtra] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTaxonomy();
      setFolders(data.folders);
      setEntities(data.entities);
      setTypes(data.documentTypes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !canEdit) return;
    setSaving(true);
    try {
      if (tab === "folders") await upsertFolder(newName, newExtra);
      if (tab === "entities") await upsertEntity(newName, newExtra);
      if (tab === "types") await upsertDocumentType(newName);
      setNewName("");
      setNewExtra("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="التنظيم والتصنيف"
        title="الملفات والجهات وأنواع المستندات"
        description="إدارة الحافظات الأرشيفية ودليل الجهات الرسمية والتصنيفات المعتمدة."
      />

      <Card className="overflow-hidden">
        <div className="px-5 pt-3">
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            items={[
              { id: "folders", label: "الملفات والحافظات", count: folders.length, icon: Folder },
              { id: "entities", label: "دليل الجهات", count: entities.length, icon: Building2 },
              { id: "types", label: "أنواع المستندات", count: types.length, icon: FileType },
            ]}
          />
        </div>

        {canEdit && (
          <form
            onSubmit={handleAdd}
            className="flex flex-col gap-2.5 border-b border-line bg-bg/40 px-5 py-4 sm:flex-row"
          >
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                tab === "folders"
                  ? "اسم الملف الجديد (مثل: ملف عقود النظافة 2026)"
                  : tab === "entities"
                  ? "اسم الجهة الرسمية (مثل: وزارة المالية)"
                  : "نوع مستند جديد (مثل: قرار إداري)"
              }
              className="input flex-1"
            />
            {tab !== "types" && (
              <input
                type="text"
                value={newExtra}
                onChange={(e) => setNewExtra(e.target.value)}
                placeholder={tab === "folders" ? "وصف مختصر (اختياري)" : "التصنيف (حكومي / شركة)"}
                className="input sm:w-64"
              />
            )}
            <button type="submit" disabled={saving} className="btn btn-primary shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              إضافة
            </button>
          </form>
        )}

        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-16" />
              ))}
            </div>
          ) : tab === "folders" ? (
            folders.length === 0 ? (
              <EmptyState
                icon={Folder}
                title="لا توجد ملفات بعد"
                description="أضف أول حافظة من الأعلى أو سيتم إنشاؤها تلقائيًا عند أرشفة المستندات."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((f) => (
                  <Link
                    key={f.id}
                    href={`/archive?folder=${encodeURIComponent(f.name)}`}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-line bg-bg/30 p-4 transition-colors hover:border-line-strong hover:bg-raised/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 shrink-0 text-faint group-hover:text-fg" aria-hidden />
                        <p className="truncate text-[13.5px] font-semibold text-fg">{f.name}</p>
                      </div>
                      {f.description && (
                        <p className="mt-1 line-clamp-1 text-[12px] text-faint">{f.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <LtrCode className="rounded-md bg-raised px-2 py-0.5 text-[11.5px] font-medium text-muted">
                        {f.documentCount}
                      </LtrCode>
                      <ArrowUpLeft className="h-3.5 w-3.5 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : tab === "entities" ? (
            entities.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="لا توجد جهات مسجلة"
                description="أضف الجهات الرسمية المتكررة لتظهر في الإكمال التلقائي أثناء التسجيل."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entities.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line bg-bg/30 p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                        <p className="truncate text-[13.5px] font-semibold text-fg">{e.name}</p>
                      </div>
                      {e.category && <p className="mt-1 text-[12px] text-faint">{e.category}</p>}
                    </div>
                    <LtrCode className="rounded-md bg-raised px-2 py-0.5 text-[11.5px] font-medium text-muted">
                      {e.documentCount}
                    </LtrCode>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg/30 p-4"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileType className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    <p className="truncate text-[13.5px] font-semibold text-fg">{t.name}</p>
                  </div>
                  <LtrCode className="rounded-md bg-raised px-2 py-0.5 text-[11.5px] font-medium text-muted">
                    {t.documentCount}
                  </LtrCode>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
