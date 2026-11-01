"use client";

import type { CheckResult, MailboxPreset, MailboxProviderId } from "@invytra/db";
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2, Plus, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { connectMailboxAction } from "@/app/email/actions";
import { btn } from "../AccountControls";
import { Field, inputCls } from "../fields";
import { Modal } from "../Modal";
import { cx } from "../ui";

const SMTP_PORTS = [465, 587, 25, 2525];
const IMAP_PORTS = [993, 143];

/** One check's result: ✓ or ✗ with the reason. */
export function CheckLine({ label, r }: { label: string; r: CheckResult }) {
  return (
    <li className="flex items-start gap-2 text-[15px]">
      {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />}
      <span>
        <span className="font-medium text-stone-900">{label}</span>{" "}
        <span className={r.ok ? "text-emerald-800" : "text-rose-700"}>{r.ok ? "works" : r.error}</span>
      </span>
    </li>
  );
}

/** "Connect mailbox": choose the email host, enter the mailbox and its password, then Invytra logs in to check it. */
export function ConnectMailboxButton({ presets }: { presets: MailboxPreset[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<MailboxPreset | null>(null);
  const [email, setEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [server, setServer] = useState({ smtpHost: "", smtpPort: 465, imapHost: "", imapPort: 993 });
  const [showServers, setShowServers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<{ smtp: CheckResult; imap: CheckResult } | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setPreset(null);
    setPassword("");
    setChecks(null);
    setError(null);
  };
  const choose = (p: MailboxPreset) => {
    setPreset(p);
    setServer({ smtpHost: p.smtpHost, smtpPort: p.smtpPort, imapHost: p.imapHost, imapPort: p.imapPort });
    setShowServers(p.id === "OTHER");
    setChecks(null);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!preset) return;
    start(async () => {
      setError(null);
      setChecks(null);
      const r = await connectMailboxAction({
        provider: preset.id as MailboxProviderId,
        email,
        fromName,
        username: username || undefined,
        password,
        smtpHost: server.smtpHost,
        smtpPort: server.smtpPort,
        smtpSecure: server.smtpPort === 465,
        imapHost: server.imapHost,
        imapPort: server.imapPort,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!r.ok) return setError(r.error);
      setChecks({ smtp: r.value.smtp, imap: r.value.imap });
      if (r.value.id) {
        setPassword("");
        router.refresh();
        setTimeout(() => {
          setOpen(false);
          setPreset(null);
          setEmail("");
          setFromName("");
          setUsername("");
          setChecks(null);
        }, 1200);
      }
    });
  };

  const connected = checks?.smtp.ok && checks.imap.ok;

  return (
    <>
      <button className={btn.primary} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Connect mailbox
      </button>
      {open && (
        <Modal
          title={preset ? `Connect a ${preset.name} mailbox` : "Connect a mailbox"}
          description={preset ? "Invytra logs in to check it can send and read replies. Your password is stored encrypted." : "Where is the mailbox hosted?"}
          onClose={close}
          busy={pending}
        >
          {!preset ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choose(p)}
                  className="rounded-xl border border-stone-200 px-4 py-3 text-left text-[15px] font-medium text-stone-800 transition hover:border-stone-400 hover:bg-stone-50"
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email address">
                  <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourdomain.com" autoComplete="off" required maxLength={254} />
                </Field>
                <Field label="Sender name" hint="What people see as “From”.">
                  <input className={inputCls} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Tahur Sayed" required maxLength={80} />
                </Field>
              </div>
              <Field label={preset.id === "GOOGLE" || preset.id === "MICROSOFT" ? "App password" : "Password"} hint={preset.passwordHelp}>
                <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required maxLength={500} />
              </Field>

              <button type="button" onClick={() => setShowServers((v) => !v)} className="inline-flex items-center gap-1 text-[14px] font-medium text-stone-600 hover:text-stone-900" aria-expanded={showServers}>
                <ChevronDown className={cx("h-4 w-4 transition", showServers && "rotate-180")} aria-hidden /> Server settings
              </button>
              {showServers && (
                <div className="grid gap-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:grid-cols-[1fr_120px]">
                  <Field label="SMTP server (sending)">
                    <input className={inputCls} value={server.smtpHost} onChange={(e) => setServer({ ...server, smtpHost: e.target.value })} placeholder="smtp.yourhost.com" required />
                  </Field>
                  <Field label="Port" hint={server.smtpPort === 465 ? "SSL" : "STARTTLS"}>
                    <select className={inputCls} value={server.smtpPort} onChange={(e) => setServer({ ...server, smtpPort: Number(e.target.value) })}>
                      {SMTP_PORTS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="IMAP server (replies)">
                    <input className={inputCls} value={server.imapHost} onChange={(e) => setServer({ ...server, imapHost: e.target.value })} placeholder="imap.yourhost.com" required />
                  </Field>
                  <Field label="Port">
                    <select className={inputCls} value={server.imapPort} onChange={(e) => setServer({ ...server, imapPort: Number(e.target.value) })}>
                      {IMAP_PORTS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Login name (optional)" hint="Leave empty if it's the email address.">
                      <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" maxLength={254} />
                    </Field>
                  </div>
                </div>
              )}

              {checks && (
                <ul className={cx("space-y-1.5 rounded-xl px-4 py-3", connected ? "bg-emerald-50" : "bg-rose-50")} aria-live="polite">
                  <CheckLine label="Sending (SMTP)" r={checks.smtp} />
                  <CheckLine label="Reading replies (IMAP)" r={checks.imap} />
                  {connected && <li className="pt-1 text-[15px] font-semibold text-emerald-800">Mailbox connected.</li>}
                </ul>
              )}
              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
                  {error}
                </p>
              )}

              <div className="flex justify-between gap-2">
                <button type="button" className={btn.ghost} onClick={() => setPreset(null)} disabled={pending}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </button>
                <button className={btn.primary} disabled={pending || !!connected}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {pending ? "Checking SMTP and IMAP…" : "Test & connect"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
