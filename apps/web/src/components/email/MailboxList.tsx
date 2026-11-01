"use client";

import type { CheckResult, MailboxPreset } from "@invytra/db";
import { AlertTriangle, Loader2, Mail, Pause, Play, RefreshCw, Send, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pauseMailboxAction, recheckMailboxAction, removeMailboxAction } from "@/app/email/actions";
import type { MailboxRow } from "@/lib/mailboxes";
import { btn } from "../AccountControls";
import { Card, EmptyState, cx } from "../ui";
import { CheckLine } from "./ConnectMailbox";
import { DomainHealth } from "./DomainHealth";
import { MailboxSettingsModal, TestEmailModal, daysText, hh } from "./MailboxSettings";

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

function Row({ m, providerName, zones, me }: { m: MailboxRow; providerName: string; zones: string[]; me: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<{ smtp: CheckResult; imap: CheckResult } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<"settings" | "test" | null>(null);
  const s = STATUS[m.status];
  const paused = m.status === "PAUSED";
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
            {m.fromName} · {providerName} · {ago(m.lastCheckedAt)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-stone-600">
            <span className="inline-flex items-center gap-2">
              <span className="font-medium text-stone-800">
                {m.sentToday} / {m.dailyLimit}
              </span>{" "}
              sent today
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-200" aria-hidden>
                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (m.sentToday / m.dailyLimit) * 100)}%` }} />
              </span>
            </span>
            <span>
              {daysText(m.sendDays)}, {hh(m.startHour)}–{hh(m.endHour)} ({m.timeZone.replace(/_/g, " ")}) · every {m.gapMinutes} min
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={btn.secondary} onClick={() => setModal("test")} disabled={pending || paused}>
            <Send className="h-4 w-4" aria-hidden /> Send test
          </button>
          <button className={btn.secondary} onClick={() => setModal("settings")}>
            <Settings2 className="h-4 w-4" aria-hidden /> Settings
          </button>
          <button
            className={btn.secondary}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await pauseMailboxAction(m.id, !paused);
                if (!r.ok) return setError(r.error);
                router.refresh();
              })
            }
          >
            {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />} {paused ? "Resume" : "Pause"}
          </button>
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
      {m.dns ? <DomainHealth dns={m.dns} /> : <p className="mt-2 text-[14px] text-stone-500">Press “Check again” to check this domain's SPF, DKIM and DMARC.</p>}
      {error && <p role="alert" className="mt-2 text-[14px] text-rose-700">{error}</p>}
      {modal === "settings" && <MailboxSettingsModal m={m} zones={zones} onClose={() => setModal(null)} />}
      {modal === "test" && <TestEmailModal m={m} defaultTo={me} onClose={() => setModal(null)} />}
    </li>
  );
}

export function MailboxList({ mailboxes, presets, zones, me }: { mailboxes: MailboxRow[]; presets: MailboxPreset[]; zones: string[]; me: string }) {
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
          <Row key={m.id} m={m} providerName={name(m.provider)} zones={zones} me={me} />
        ))}
      </ul>
    </Card>
  );
}
