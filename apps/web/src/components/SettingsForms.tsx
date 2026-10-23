"use client";

import { Check, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePasswordAction, renameWorkspaceAction, saveProfileAction, signOutOthersAction } from "@/app/app/settings/actions";
import { btn } from "./AccountControls";
import { Field, inputCls } from "./fields";

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;

function useSave(): { run: Run; pending: boolean; error: string | null; saved: boolean } {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const run: Run = (fn, after) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setSaved(true);
      after?.();
      router.refresh();
    });
  return { run, pending, error, saved };
}

function Footer({ pending, error, saved, label, savedText = "Saved" }: { pending: boolean; error: string | null; saved: boolean; label: string; savedText?: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
      {error && (
        <p role="alert" className="mr-auto text-[15px] text-rose-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mr-auto inline-flex items-center gap-1.5 text-[15px] font-medium text-emerald-700">
          <Check className="h-4 w-4" aria-hidden /> {savedText}
        </p>
      )}
      <button className={btn.primary} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {label}
      </button>
    </div>
  );
}

export function ProfileForm({ name: n0, email: e0 }: { name: string; email: string }) {
  const [name, setName] = useState(n0);
  const [email, setEmail] = useState(e0);
  const [currentPassword, setCurrent] = useState("");
  const s = useSave();
  const emailChanged = email.trim().toLowerCase() !== e0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        s.run(() => saveProfileAction({ name, email, currentPassword }), () => setCurrent(""));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        {emailChanged && (
          <Field label="Current password" hint="Needed to change the email you log in with." className="sm:col-span-2">
            <input className={inputCls} type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
      </div>
      <Footer {...s} label="Save profile" />
    </form>
  );
}

export function PasswordForm() {
  const [v, setV] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const s = useSave();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        s.run(() => changePasswordAction(v), () => setV({ currentPassword: "", newPassword: "", confirm: "" }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <input className={inputCls} type="password" value={v.currentPassword} onChange={set("currentPassword")} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 10 characters.">
          <input className={inputCls} type="password" value={v.newPassword} onChange={set("newPassword")} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password">
          <input className={inputCls} type="password" value={v.confirm} onChange={set("confirm")} autoComplete="new-password" />
        </Field>
      </div>
      <Footer {...s} label="Change password" savedText="Password changed — other devices were signed out" />
    </form>
  );
}

export function SignOutOthers() {
  const s = useSave();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[15px] text-stone-600">
        {s.saved ? "Done — every other browser and device has been signed out." : "Lost a laptop or used a shared computer? Sign out everywhere except here."}
      </p>
      <button className={btn.secondary} disabled={s.pending} onClick={() => s.run(() => signOutOthersAction())}>
        {s.pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />} Sign out other devices
      </button>
    </div>
  );
}

export function WorkspaceForm({ name: n0, canEdit }: { name: string; canEdit: boolean }) {
  const [name, setName] = useState(n0);
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        s.run(() => renameWorkspaceAction({ name }));
      }}
    >
      <Field label="Company name" hint={canEdit ? "Shown in the sidebar and to your teammates." : "Only the workspace owner can change this."}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={80} />
      </Field>
      {canEdit && <Footer {...s} label="Save" />}
    </form>
  );
}
