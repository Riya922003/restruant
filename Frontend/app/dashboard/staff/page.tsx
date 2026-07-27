"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, humanize } from "@/lib/formatters";
import type { UserRole } from "@/types/roles";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAppDialog } from "@/components/ui/app-dialog";

type StaffUser = {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

const ALL_ROLES: UserRole[] = ["owner", "manager", "chef", "waiter", "cashier", "store_manager"];

const EMPTY = { full_name: "", email: "", password: "", role: "waiter" as UserRole, phone: "" };

export default function StaffPage() {
  const toast = useToast();
  const dialog = useAppDialog();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  // Roles this actor may assign. Managers cannot mint or elevate to owner.
  const assignableRoles = isOwner ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "owner");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const { data, loading, error, refetch } = useApi(
    () =>
      api.list<StaffUser>(
        `/users?limit=100` +
          (roleFilter ? `&role=${roleFilter}` : "") +
          (activeFilter ? `&is_active=${activeFilter}` : "") +
          (search ? `&search=${encodeURIComponent(search)}` : "")
      ),
    [search, roleFilter, activeFilter]
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin password reset dialog.
  const [pwTarget, setPwTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  // Whether the current actor may run destructive/edit actions on a target row.
  // Managers cannot touch owner accounts; the server enforces this too.
  function canManageRow(u: StaffUser) {
    if (u.role === "owner" && !isOwner) return false;
    return true;
  }
  const isSelf = (u: StaffUser) => u.id === user?.id;

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, role: assignableRoles.includes("waiter") ? "waiter" : assignableRoles[0] });
    setFormError(null);
    setOpen(true);
  }
  function openEdit(u: StaffUser) {
    setEditing(u);
    setForm({ full_name: u.full_name, email: u.email, password: "", role: u.role, phone: u.phone ?? "" });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/users/${editing.id}`, {
          full_name: form.full_name,
          phone: form.phone || null,
          role: form.role,
        });
      } else {
        await api.post("/users", {
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          phone: form.phone || null,
        });
      }
      setOpen(false);
      toast.success(editing ? "Staff member updated" : "Staff member created");
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    const verb = u.is_active ? "Deactivate" : "Reactivate";
    if (!(await dialog.confirm({ title: `${verb} user`, message: `${verb} ${u.full_name}?`, confirmLabel: verb, destructive: u.is_active }))) return;
    try {
      if (u.is_active) await api.del(`/users/${u.id}`);
      else await api.patch(`/users/${u.id}`, { is_active: true });
      toast.success(u.is_active ? "User deactivated" : "User reactivated");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  function openReset(u: StaffUser) {
    setPwTarget(u);
    setNewPassword("");
    setPwError(null);
    setPwDone(false);
  }
  async function submitReset() {
    if (!pwTarget) return;
    setPwSaving(true);
    setPwError(null);
    try {
      await api.post(`/users/${pwTarget.id}/reset-password`, { new_password: newPassword });
      setPwDone(true);
      toast.success("Password reset");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setPwSaving(false);
    }
  }

  const createValid = form.full_name && form.email && form.password.length >= 8;
  const editValid = form.full_name.trim().length > 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Staff"
        subtitle="Manage user accounts, roles, and access"
        actions={<Button onClick={openCreate}>New staff</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="max-w-44">
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </Select>
        <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="max-w-40">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No staff found"
          description="Add a staff account to grant access."
          action={<Button onClick={openCreate}>New staff</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((u) => {
                const manageable = canManageRow(u);
                return (
                  <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {u.full_name}
                      {isSelf(u) ? <span className="ml-2 text-xs text-zinc-400">(you)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone="blue">{humanize(u.role)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{u.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatDateTime(u.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.is_active ? "green" : "zinc"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {manageable ? (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => openEdit(u)}>
                              Edit
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => openReset(u)}>
                              Reset password
                            </Button>
                            {/* No self-deactivate: hidden here for UX, enforced on the server. */}
                            {!isSelf(u) ? (
                              <Button
                                variant={u.is_active ? "danger" : "secondary"}
                                size="sm"
                                onClick={() => toggleActive(u)}
                              >
                                {u.is_active ? "Deactivate" : "Reactivate"}
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create / edit modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit staff" : "New staff"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || (editing ? !editValid : !createValid)}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name">
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          {editing ? (
            <Field label="Email" hint="Email is fixed after creation">
              <Input value={form.email} disabled />
            </Field>
          ) : (
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          )}
          {editing ? null : (
            <Field label="Password" hint="At least 8 characters">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {humanize(r)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>
      </Modal>

      {/* Admin reset-password modal */}
      <Modal
        open={!!pwTarget}
        onClose={() => setPwTarget(null)}
        title={pwTarget ? `Reset password — ${pwTarget.full_name}` : "Reset password"}
        footer={
          pwDone ? (
            <Button onClick={() => setPwTarget(null)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setPwTarget(null)}>
                Cancel
              </Button>
              <Button onClick={submitReset} disabled={pwSaving || newPassword.length < 8}>
                {pwSaving ? "Saving..." : "Set password"}
              </Button>
            </>
          )
        }
      >
        {pwDone ? (
          <p className="text-sm text-zinc-700">
            Password updated. Share the new password with the user securely; they can change it after logging in.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Set a new password for this account. The old password is not required.
            </p>
            <Field label="New password" hint="At least 8 characters">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {pwError ? <p className="text-sm text-red-700">{pwError}</p> : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
