"use client";

import {
  ACCOUNT_COUNTS,
  GOALS,
  HEARD_FROM,
  ONBOARDING_CHANNELS,
  ROLES,
  planIntro,
  setupPlan,
  type OnboardingAnswers,
} from "@invytra/shared";
import { ArrowRight, Check, ChevronLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOnboardingAction } from "@/app/workspace/onboarding-actions";
import { LogoMark } from "../LogoMark";
import { cx } from "../ui";

type Option = { id: string; label: string; soon?: boolean };
type Step =
  | { key: "role" | "goal" | "accounts"; kind: "one"; question: string; options: readonly Option[] }
  | { key: "channels"; kind: "many"; question: string; options: readonly Option[] }
  | { key: "heardFrom"; kind: "heard"; question: string; options: readonly Option[] }
  | { key: "plan"; kind: "plan"; question: string };

const NO_PROGRESS = { linkedinAccounts: 0, mailboxes: 0, people: 0, campaignsLive: 0, voices: 0, doNotContact: 0 };

/** The questions after sign-up, one per screen; every one can be skipped. Ends with their setup plan. */
export function Onboarding({ firstName, whatsappLive }: { firstName: string; whatsappLive: boolean }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const steps: Step[] = [
    { key: "role", kind: "one", question: "What best describes you?", options: ROLES },
    { key: "goal", kind: "one", question: "What do you want Invytra to help you with?", options: GOALS },
    {
      key: "channels",
      kind: "many",
      question: "Where will you reach people?",
      options: ONBOARDING_CHANNELS.map((c) => ({ ...c, soon: c.id === "whatsapp" && !whatsappLive })),
    },
    ...(a.channels?.length && !a.channels.includes("linkedin") ? [] : [{ key: "accounts", kind: "one", question: "How many LinkedIn accounts will you run?", options: ACCOUNT_COUNTS } as Step]),
    { key: "heardFrom", kind: "heard", question: "How did you hear about Invytra?", options: HEARD_FROM },
    { key: "plan", kind: "plan", question: "Here's your setup plan" },
  ];
  const step = steps[Math.min(i, steps.length - 1)]!;
  const next = () => setI((x) => Math.min(x + 1, steps.length - 1));
  const back = () => setI((x) => Math.max(0, x - 1));

  const finish = (answers: OnboardingAnswers) =>
    start(async () => {
      setError("");
      const r = await saveOnboardingAction(answers);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });

  const pickOne = (key: "role" | "goal" | "accounts" | "heardFrom", id: string) => {
    setA((x) => ({ ...x, [key]: id }));
    // Single answers move on by themselves (a moment later, so the tick is seen).
    if (key !== "heardFrom" || id !== "other") setTimeout(next, 180);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="flex items-center gap-2 text-[16px] font-semibold text-stone-900">
          <LogoMark size={26} /> Invytra
        </span>
        {step.kind !== "plan" && (
          <button type="button" disabled={pending} onClick={() => finish(a)} className="text-[14px] font-medium text-stone-500 hover:text-stone-900">
            Skip setup
          </button>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-5 pb-10 pt-6 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:pt-20">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight sm:text-[40px]">
            <span className="block text-stone-400">{i === 0 ? `Welcome to Invytra, ${firstName}.` : step.kind === "plan" ? "You're all set." : "Let's tailor Invytra to you."}</span>
            <span className="block text-stone-900">{step.question}</span>
          </h1>
          {step.kind === "plan" && <p className="mt-4 text-[16px] text-stone-500">{planIntro(a)} Each step ticks itself off as you go.</p>}
        </div>

        <div>
          {step.kind === "one" && (
            <>
              <p className="mb-3 text-[14px] text-stone-400">Select one</p>
              <ul className="space-y-1">
                {step.options.map((o) => (
                  <li key={o.id}>
                    <Choice on={a[step.key] === o.id} round onClick={() => pickOne(step.key, o.id)}>
                      {o.label}
                    </Choice>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step.kind === "many" && (
            <>
              <p className="mb-3 text-[14px] text-stone-400">Select one or more</p>
              <ul className="space-y-1">
                {step.options.map((o) => {
                  const on = !!a.channels?.includes(o.id as never);
                  return (
                    <li key={o.id}>
                      <Choice
                        on={on}
                        onClick={() =>
                          setA((x) => {
                            const cur = x.channels ?? [];
                            return { ...x, channels: (on ? cur.filter((c) => c !== o.id) : [...cur, o.id]) as OnboardingAnswers["channels"] };
                          })
                        }
                      >
                        {o.label}
                        {o.soon && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[12px] font-semibold text-sky-800">Coming soon</span>}
                      </Choice>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {step.kind === "heard" && (
            <>
              <p className="mb-3 text-[14px] text-stone-400">Select one</p>
              <ul className="space-y-1">
                {step.options.map((o) => (
                  <li key={o.id}>
                    <Choice on={a.heardFrom === o.id} round onClick={() => pickOne("heardFrom", o.id)}>
                      {o.label}
                    </Choice>
                  </li>
                ))}
              </ul>
              {a.heardFrom === "other" && (
                <input
                  autoFocus
                  value={a.heardOther ?? ""}
                  maxLength={120}
                  onChange={(e) => setA((x) => ({ ...x, heardOther: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="A podcast, a newsletter, an event…"
                  className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-3 text-[16px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              )}
            </>
          )}

          {step.kind === "plan" && (
            <ol className="space-y-2">
              {setupPlan(a, NO_PROGRESS).map((s, n) => (
                <li key={s.id} className="flex gap-3.5 rounded-xl border border-stone-200 px-4 py-3.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800">{n + 1}</span>
                  <div>
                    <p className="text-[16px] font-medium text-stone-900">{s.title}</p>
                    <p className="mt-0.5 text-[14px] leading-snug text-stone-500">{s.why}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {step.kind === "plan" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => finish(a)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-400 px-5 py-3 text-[16px] font-semibold text-stone-900 shadow-glow transition hover:bg-brand-300 disabled:opacity-70"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Go to my workspace <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            ) : step.kind === "many" || (step.kind === "heard" && a.heardFrom === "other") ? (
              <button type="button" onClick={next} className="rounded-xl bg-brand-400 px-5 py-2.5 text-[15px] font-semibold text-stone-900 shadow-glow transition hover:bg-brand-300">
                Continue
              </button>
            ) : null}
            {step.kind !== "plan" && (
              <button
                type="button"
                onClick={() => {
                  setA((x) => ({ ...x, [step.key]: undefined }));
                  next();
                }}
                className="rounded-xl border border-stone-200 px-4 py-2.5 text-[15px] font-medium text-stone-700 hover:border-stone-300"
              >
                Skip
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-[14px] text-rose-700">{error}</p>}
        </div>
      </main>

      <footer className="relative flex items-center justify-center px-5 pb-8 sm:px-8">
        {i > 0 && (
          <button type="button" onClick={back} aria-label="Back" className="absolute left-5 grid h-10 w-10 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900 sm:left-8">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        <div className="flex items-center gap-2" aria-label={`Step ${i + 1} of ${steps.length}`}>
          {steps.map((s, n) => (
            <span key={s.key} className={cx("h-2 rounded-full transition-all", n === i ? "w-8 bg-brand-400" : n < i ? "w-2 bg-brand-600" : "w-2 bg-stone-300")} />
          ))}
        </div>
      </footer>
    </div>
  );
}

function Choice({ on, round, onClick, children }: { on: boolean; round?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role={round ? "radio" : "checkbox"}
      aria-checked={on}
      onClick={onClick}
      className={cx("flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[17px] transition", on ? "bg-brand-50 text-stone-900" : "text-stone-800 hover:bg-stone-50")}
    >
      <span
        className={cx(
          "grid h-6 w-6 shrink-0 place-items-center border transition",
          round ? "rounded-full" : "rounded-md",
          on ? "border-brand-500 bg-brand-400 text-stone-900" : "border-stone-300 bg-white",
        )}
      >
        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
      </span>
      <span className="flex items-center">{children}</span>
    </button>
  );
}
