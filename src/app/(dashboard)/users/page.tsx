"use client";

import { useEffect, useState, useCallback } from "react";
import { UserPlus, Shield, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS, type UserProfile, type UserRole } from "@/lib/types";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatusPill,
} from "@/components/ui/primitives";

export default function UsersPage() {
  const { profile, getIdToken } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("editor");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر جلب المستخدمين.");
      setUsers(json.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (profile?.role === "admin") loadUsers();
    else setLoading(false);
  }, [profile?.role, loadUsers]);

  if (profile?.role !== "admin") {
    return (
      <Card>
        <EmptyState
          icon={Shield}
          title="صلاحية مدير النظام مطلوبة"
          description="هذه الصفحة مخصصة لمدير النظام فقط لإدارة حسابات الموظفين وصلاحيات الوصول."
        />
      </Card>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName, email, password, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر إنشاء الحساب.");
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("editor");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء المستخدم");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (
    uid: string,
    updates: { role?: UserRole; active?: boolean }
  ) => {
    try {
      const token = await getIdToken();
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, ...updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر التحديث.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل التحديث");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة الوصول"
        title="المستخدمون والصلاحيات"
        description="إضافة حسابات الموظفين وتعيين مستويات الصلاحية (مدير النظام، مدخل بيانات، مطلع فقط)."
      />

      <Card>
        <CardHeader icon={UserPlus} title="إضافة موظف جديد" />
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="الاسم الكامل"
            className="input"
          />
          <input
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@organization.gov.eg"
            className="input"
          />
          <input
            type="password"
            dir="ltr"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور (6+ أحرف)"
            className="input"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="input"
          >
            <option value="admin">{ROLE_LABELS.admin}</option>
            <option value="editor">{ROLE_LABELS.editor}</option>
            <option value="viewer">{ROLE_LABELS.viewer}</option>
          </select>
          <button type="submit" disabled={creating} className="btn btn-primary">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            إنشاء الحساب
          </button>
        </form>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[12.5px] text-danger">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] font-medium text-faint">
                <th scope="col" className="px-5 py-3 text-start font-medium">الموظف</th>
                <th scope="col" className="px-3 py-3 text-start font-medium">البريد الإلكتروني</th>
                <th scope="col" className="px-3 py-3 text-start font-medium">الصلاحية</th>
                <th scope="col" className="px-3 py-3 text-start font-medium">الحالة</th>
                <th scope="col" className="px-5 py-3 text-end font-medium">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-6">
                    <div className="space-y-2.5">
                      <div className="skeleton h-10" />
                      <div className="skeleton h-10" />
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.uid} className="hover:bg-raised/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.displayName} />
                        <span className="font-medium text-fg">{u.displayName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      <bdi dir="ltr">{u.email}</bdi>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdate(u.uid, { role: e.target.value as UserRole })}
                        className="input h-8 w-36 text-[12px]"
                      >
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="editor">{ROLE_LABELS.editor}</option>
                        <option value="viewer">{ROLE_LABELS.viewer}</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {u.active ? (
                        <StatusPill tone="ok">نشط</StatusPill>
                      ) : (
                        <StatusPill tone="danger">معطل</StatusPill>
                      )}
                    </td>
                    <td className="px-5 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => handleUpdate(u.uid, { active: !u.active })}
                        className="btn btn-secondary btn-sm"
                      >
                        {u.active ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
