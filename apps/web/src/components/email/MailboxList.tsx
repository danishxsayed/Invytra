"use client";

import type { CheckResult, MailboxPreset } from "@invytra/db";
import { AlertTriangle, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recheckMailboxAction, removeMailboxAction } from "@/app/email/actions";
import type { MailboxRow } from "@/lib/mailboxes";
import { btn } from "../AccountControls";
import { Card, EmptyState, cx } from "../ui";
import { CheckLine } from "./ConnectMailbox";

const STATUS: Record<MailboxRow["status"], { text: string; cls: string }> = {
  ACTIVE: { text: "Connected", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  ERROR: { text: "Needs attention", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  PAUSED: { text: "Paused", cls: "bg-stone-100 text-stone-600 ring-stone-500/15" },
};

function ago(d: Date | null): string {
  if (!d) return "not checked yet";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? "checked just now" : m < 60 ? `checked ${m} min ago` : m < 1440 ? `checked ${Math.round(m / 60)} h ago` : `checked ${Math.round(m / 1440)} d ago`;
}

function Row({ m, providerName }: { m: MailboxRow; providerName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<{ smtp: CheckResult; imap: CheckResult } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = STATUS[m.status];
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700" aria-hidden>
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[16px] font-semibold text-stone-900">{m.email}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[13px] font-medium ring-1", s.cls)}>{s.text}</span>
          </p>
          <p className="truncate text-[14px] text-stone-500">
            {m.fromName} · {providerName} · up to {m.dailyLimit} emails a day · {ago(m.lastCheckedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className={btn.secondary}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await recheckMailboxAction(m.id);
                if (!r.ok) return setError(r.error);
                setChecks({ smtp: r.value.smtp, imap: r.value.imap });
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Check again
          </button>
          {!confirm ? (
            <button className={btn.ghost} onClick={() => setConfirm(true)} aria-label={`Remove ${m.email}`}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              className={cx(btn.secondary, "border-rose-300 text-rose-700 hover:bg-rose-50")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeMailboxAction(m.id);
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                })
              }
            >
              Yes, remove
            </button>
          )}
        </div>
      </div>
      {m.status === "ERROR" && m.statusReason && !checks && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {m.statusReason}
        </p>
      )}
      {checks && (
        <ul className="mt-2 space-y-1 rounded-lg bg-stone-50 px-3 py-2">
          <CheckLine label="Sending (SMTP)" r={checks.smtp} />
          <CheckLine label="Reading replies (IMAP)" r={checks.imap} />
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-[14px] text-rose-700">{error}</p>}
    </li>
  );
}

export function MailboxList({ mailboxes, presets }: { mailboxes: MailboxRow[]; presets: MailboxPreset[] }) {
  if (mailboxes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Mail}
          title="No mailboxes yet"
          body="Connect a mailbox on your own domain (Google Workspace, Microsoft 365, Zoho, Hostinger, GoDaddy or any SMTP/IMAP host). Tip: send cold email from a separate domain, not your main one."
        />
      </Card>
    );
  }
  const name = (id: string) => presets.find((p) => p.id === id)?.name ?? id;
  return (
    <Card>
      <ul className="divide-y divide-stone-100">
        {mailboxes.map((m) => (
          <Row key={m.id} m={m} providerName={name(m.provider)} />
        ))}
      </ul>
    </Card>
  );
}
