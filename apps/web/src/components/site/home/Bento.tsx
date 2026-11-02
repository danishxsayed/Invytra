import { Cloud, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../ui";
import { Reveal } from "../motion";
import { ChannelTile, Eyebrow, h2 } from "./bits";
import { Typewriter } from "./Typewriter";

function Card({ title, body, children, className, delay = 0, dark }: { title: string; body: string; children?: ReactNode; className?: string; delay?: number; dark?: boolean }) {
  return (
    <Reveal
      delay={delay}
      className={cx(
        "group flex flex-col overflow-hidden rounded-[28px] border transition duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(28,25,23,.3)]",
        dark ? "border-transparent bg-stone-900" : "border-stone-900/[0.07] bg-white",
        className,
      )}
    >
      <div className="p-7 pb-0 sm:p-8 sm:pb-0">
        <h3 className={cx("font-display text-[24px] font-semibold tracking-[-0.02em]", dark ? "text-white" : "text-stone-900")}>{title}</h3>
        <p className={cx("mt-2 max-w-[440px] text-[16px] leading-relaxed", dark ? "text-white/65" : "text-stone-600")}>{body}</p>
      </div>
      <div className="mt-auto p-7 pt-6 sm:p-8 sm:pt-6">{children}</div>
    </Reveal>
  );
}

/** Everything else, as a grid of small product moments. */
export function Bento({ inbox }: { inbox: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-28">
      <Reveal className="max-w-[720px]">
        <Eyebrow>Built in</Eyebrow>
        <h2 className={`${h2} mt-4 text-stone-900`}>Everything you need to start real conversations.</h2>
      </Reveal>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        <Card title="One inbox for every reply" body="LinkedIn messages, email replies and WhatsApp chats side by side, linked to the person and the campaign." className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl ring-1 ring-stone-900/[0.06] transition duration-700 group-hover:scale-[1.015]">{inbox}</div>
        </Card>
        <Card title="Writes with you" body="Describe your offer once. The AI writer drafts each step in your tone, and you edit before anything is sent." delay={120} dark>
          <div className="rounded-2xl bg-white/[0.06] p-4 text-[14.5px] leading-relaxed text-white/85 ring-1 ring-white/10">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Draft · friendly, short
            </p>
            <Typewriter text="Hi Sara, loved your post on hiring remote teams. Would a quick chat next week help?" />
          </div>
        </Card>
        <Card title="Clean lists, fewer bounces" body="Check every email address before you send. Bad and risky ones are set aside for you." delay={60}>
          <div className="space-y-2.5">
            {[
              ["Valid", "w-[78%]", "bg-brand-400", "78%"],
              ["Risky", "w-[14%]", "bg-amber-300", "14%"],
              ["Invalid", "w-[8%]", "bg-rose-300", "8%"],
            ].map(([l, w, c, v]) => (
              <div key={l} className="flex items-center gap-3 text-[14px]">
                <span className="w-14 text-stone-600">{l}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span className={cx("site-bar block h-full origin-left rounded-full", w, c)} />
                </span>
                <span className="w-9 text-right font-medium tabular text-stone-800">{v}</span>
              </div>
            ))}
            <p className="pt-1 text-[12.5px] text-stone-400">Example list</p>
          </div>
        </Card>
        <Card title="Safe by default" body="Human pace on LinkedIn, warm-up and daily caps for email, and the official API for WhatsApp." delay={120}>
          <div className="flex items-end gap-1.5" aria-hidden>
            {[52, 64, 58, 70, 61, 0, 0].map((h, i) => (
              <span key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={cx("w-full rounded-md", h ? "bg-brand-300" : "bg-stone-100")} style={{ height: h || 10 }} />
                <span className="text-[11px] text-stone-400">{"MTWTFSS"[i]}</span>
              </span>
            ))}
          </div>
        </Card>
        <Card title="Runs while you sleep" body="Campaigns run in the cloud, inside each account's working hours and time zone. Close your laptop." delay={180}>
          <div className="flex items-center gap-4 rounded-2xl bg-canvas p-4">
            <span className="site-pulse flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-400">
              <Cloud className="h-5 w-5 text-stone-900" aria-hidden />
            </span>
            <div className="text-[14px]">
              <p className="font-semibold text-stone-900">3 campaigns running</p>
              <p className="text-stone-500">Next step: 09:42 in Dubai</p>
            </div>
          </div>
        </Card>
        <Card title="Your whole team, one workspace" body="Add teammates and every account they manage. Each lead stays with one sender, so nobody hears from you twice." className="lg:col-span-3" delay={60}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2">
              {["bg-sky-200", "bg-amber-200", "bg-rose-200", "bg-emerald-200"].map((c, i) => (
                <span key={i} className={cx("flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold text-stone-700 ring-2 ring-white", c)}>
                  {["AK", "MR", "JL", "SP"][i]}
                </span>
              ))}
            </div>
            <span className="flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-[13.5px] text-stone-600">
              <UsersRound className="h-4 w-4" aria-hidden /> 4 teammates
            </span>
            <span className="flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-[13.5px] text-stone-600">
              <ChannelTile id="linkedin" size={18} /> 6 accounts
            </span>
            <span className="flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-[13.5px] text-stone-600">
              <ShieldCheck className="h-4 w-4" aria-hidden /> No double contact
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
}
