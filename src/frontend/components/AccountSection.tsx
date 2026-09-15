"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/frontend/api";
import ConfirmDialog from "@/frontend/components/ConfirmDialog";

const inputCls =
  "w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-white transition placeholder:text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function AccountSection() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ ok: false, text: "Пароли не совпадают" });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await requestJson("/api/auth/account", {
      method: "PATCH",
      body: { currentPassword, newPassword },
    });
    setSaving(false);
    if (res.ok) {
      setMessage({ ok: true, text: "Пароль обновлён" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setMessage({ ok: false, text: res.data.error ?? "Не удалось обновить пароль" });
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const res = await requestJson("/api/auth/account", {
      method: "DELETE",
      body: { password: deletePassword },
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setDeleting(false);
      setDeleteError(res.data.error ?? "Не удалось удалить аккаунт");
    }
  }

  return (
    <div className="card glass p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80">Безопасность</p>
      <h2 className="display mt-2 text-xl font-semibold text-white">Пароль</h2>

      <form onSubmit={changePassword} className="mt-5 flex flex-col gap-3">
        <label htmlFor="current-password" className="sr-only">
          Текущий пароль
        </label>
        <input
          id="current-password"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Текущий пароль"
          className={inputCls}
        />
        <label htmlFor="new-password" className="sr-only">
          Новый пароль
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Новый пароль (мин. 8 символов)"
          className={inputCls}
        />
        <label htmlFor="confirm-password" className="sr-only">
          Повторите новый пароль
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Повторите новый пароль"
          className={inputCls}
        />
        {message && (
          <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-400"}`} role="status">
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="btn-ghost mt-1 self-start rounded-full px-5 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : "Обновить пароль"}
        </button>
      </form>

      <div className="mt-8 border-t border-line pt-6">
        <h3 className="text-sm font-semibold text-white">Удалить аккаунт</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Проекты, планы и история платежей будут удалены безвозвратно.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeletePassword("");
            setDeleteOpen(true);
          }}
          className="mt-4 rounded-full border border-red-400/40 px-5 py-2 text-sm text-red-300 transition hover:bg-red-400/10"
        >
          Удалить аккаунт
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        danger
        title="Удалить аккаунт?"
        description="Это действие нельзя отменить. Введите пароль, чтобы подтвердить."
        confirmLabel="Удалить навсегда"
        loading={deleting}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteAccount}
      >
        <label htmlFor="delete-password" className="sr-only">
          Пароль
        </label>
        <input
          id="delete-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Пароль"
          className={inputCls}
        />
      </ConfirmDialog>
    </div>
  );
}
