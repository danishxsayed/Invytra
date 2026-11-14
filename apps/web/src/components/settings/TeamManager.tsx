"use client";

import { Loader2, Mail, RotateCw, UserMinus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelInviteAction, inviteMemberAction, removeMemberAction } from "@/app/workspace/settings/actions";
import { Avatar, cx } from "../ui";

export type TeamMember = { id: string; name: string; email: string; owner: boolean; you: boolean; lastLogin: string | null };
export type TeamInvite = { id: string; email: string; sent: string };
type Outcome = { ok: boolean; error?: string };

/** The team: members, invitations waiting, and (for the owner) inviting and removing. */
export function TeamManager({ members, invites, canManage }: { members: TeamMember[]; invites: TeamInvite[]; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<Outcome>, done: string, after?: () => void) =>
    start(async () => {
      setBusy(key);
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Something went wrong." });
      setBusy(null);
      setConfirmRemove(null);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-stone-900">
                {m.name}
                {m.you && <span className="font-normal text-stone-400"> (you)</span>}
              </p>
              <p className="truncate text-[14px] text-stone-500">{m.email}</p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-medium text-stone-700">{m.owner ? "Owner" : "Member"}</p>
              {m.lastLogin && <p className="text-[13px] text-stone-400">Last login {m.lastLogin}</p>}
            </div>
            {canManage && !m.owner && !m.you && (
              <div className="flex w-full justify-end sm:w-auto">
                {confirmRemove === m.id ? (
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] text-rose-900">
                    Remove {m.name.split(" ")[0]}? Their login stops working.
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(m.id, () => removeMemberAction(m.id), `${m.name} was removed.`)}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700"
                    >
                      {busy === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Remove
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(null)} className="font-medium underline">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(m.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Remove ${m.name}`}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden /> Remove
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 bg-stone-50/60 px-4 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-stone-300 text-stone-400" aria-hidden>
              <Mail className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-stone-700">{i.email}</p>
              <p className="text-[13px] text-stone-500">Invited {i.sent} · waiting to join</p>
            </div>
            {canManage && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(`r-${i.id}`, () => inviteMemberAction(i.email), `A fresh invitation went to ${i.email}.`)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-stone-600 hover:bg-stone-100"
                >
                  {busy === `r-${i.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />} Resend
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(`c-${i.id}`, () => cancelInviteAction(i.id), `The invitation to ${i.email} was cancelled.`)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13.5px] text-stone-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X className="h-4 w-4" aria-hidden /> Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const to = email.trim();
            if (to) run("invite", () => inviteMemberAction(to), `Invitation sent to ${to}.`, () => setEmail(""));
          }}
        >
          <label className="sr-only" htmlFor="invite-email">
            Teammate&apos;s email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-[15px] focus:border-stone-400 focus:outline-none focus:ring-4 focus:ring-stone-100"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {busy === "invite" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Send invitation
          </button>
        </form>
      ) : (
        <p className="text-[14px] text-stone-500">Only the workspace owner can invite or remove teammates.</p>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cx("rounded-lg px-3 py-2 text-[14px]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
          {msg.text}
        </p>
      )}
      {canManage && (
        <p className="text-[13.5px] text-stone-500">
          Teammates join with the emailed link (it works for 7 days) and share everything in this workspace. Billing and deleting the workspace stay with the owner. Every plan includes unlimited teammates.
        </p>
      )}
    </div>
  );
}
