import { cx } from "../ui";

/**
 * Hero illustration: one LinkedIn account's week in Invytra. Actions land at
 * irregular times inside working hours (09:00–18:00), weekends stay empty, and
 * a reply cancels that person's follow-ups. Deterministic (seeded) so the
 * server and browser render the same picture.
 */
type Kind = "visit" | "invite" | "message" | "check";
const KIND: Record<Kind, { cls: string; label: string }> = {
  visit: { cls: "bg-teal-500", label: "Profile visit" },
  invite: { cls: "bg-brand-400 ring-1 ring-brand-700/40", label: "Invite" },
  message: { cls: "bg-sky-500", label: "Message" },
  check: { cls: "bg-stone-300", label: "Acceptance check" },
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const START = 9;
const END = 18;

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function weekEvents() {
  const rand = seeded(11);
  const plan: Record<number, Partial<Record<Kind, number>>> = {
    0: { visit: 6, invite: 3 },
    1: { visit: 5, invite: 5, check: 2 },
    2: { visit: 4, invite: 4, check: 3, message: 2 },
    3: { visit: 3, invite: 5, check: 3, message: 2 },
    4: { visit: 4, invite: 3, check: 3, message: 3 },
  };
  const out: { day: number; hour: number; kind: Kind; x: number }[] = [];
  for (const [d, kinds] of Object.entries(plan)) {
    // Shuffle the day's actions, then spread them through the day with jitter (stratified), like a person working through a list.
    const day = (Object.entries(kinds) as [Kind, number][]).flatMap(([k, n]) => Array.from({ length: n }, () => k));
    for (let i = day.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [day[i], day[j]] = [day[j]!, day[i]!];
    }
    const slot = (END - START - 0.5) / day.length;
    day.forEach((kind, i) => out.push({ day: Number(d), hour: START + 0.25 + (i + 0.15 + rand() * 0.7) * slot, kind, x: 6 + rand() * 26 }));
  }
  return out;
}

const EVENTS = weekEvents();
const REPLY = { day: 3, hour: 14.2 };
const top = (h: number) => `${((h - START) / (END - START)) * 100}%`;

export function PacingWeek() {
  return (
    <figure className="relative rounded-[22px] border border-stone-900/10 bg-white p-4 shadow-[0_30px_60px_-30px_rgba(41,37,36,0.35)] sm:p-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-[19px] font-semibold text-stone-900">One account, one week</span>
        <span className="text-[14px] text-stone-500">Working hours 09:00–18:00, your time zone</span>
      </figcaption>

      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-x-1.5 sm:grid-cols-[42px_repeat(7,minmax(0,1fr))] sm:gap-x-2">
        <div />
        {DAYS.map((d, i) => (
          <div key={d} className={cx("pb-2 text-center text-[13px] font-medium", i > 4 ? "text-stone-300" : "text-stone-500")}>
            {d}
          </div>
        ))}

        <div className="relative h-[300px] sm:h-[340px]">
          {[9, 12, 15, 18].map((h) => (
            <span key={h} className="absolute right-1 -translate-y-1/2 text-[12px] tabular-nums text-stone-400" style={{ top: top(h) }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {DAYS.map((d, day) => (
          <div
            key={d}
            className={cx("relative h-[300px] rounded-lg sm:h-[340px]", day > 4 ? "bg-stone-100/70" : "bg-stone-50 ring-1 ring-inset ring-stone-900/[0.05]")}
            style={day > 4 ? { backgroundImage: "repeating-linear-gradient(135deg, transparent 0 7px, rgba(120,113,108,0.08) 7px 8px)" } : undefined}
          >
            {day > 4 && <span className="absolute inset-x-0 top-[22%] text-center text-[12px] text-stone-400">Off</span>}
            {day === 5 && (
              <span
                className="absolute left-0 z-20 hidden w-[calc(200%+0.5rem)] -translate-y-1/2 rounded-xl bg-stone-900 px-3 py-2.5 text-[13px] leading-snug text-white shadow-lg animate-pop lg:block"
                style={{ top: top(REPLY.hour), animationDelay: "1650ms" }}
              >
                <span className="block font-semibold">Thu 14:12, Priya replied.</span> Her follow-ups were cancelled.
              </span>
            )}
            {EVENTS.filter((e) => e.day === day).map((e) => (
              <span
                key={`${e.day}-${e.hour}`}
                title={`${KIND[e.kind].label}, ${d} ${Math.floor(e.hour)}:${String(Math.round((e.hour % 1) * 60)).padStart(2, "0")}`}
                className={cx("absolute h-[9px] -translate-y-1/2 rounded-full animate-pop", KIND[e.kind].cls, e.kind === "check" ? "w-[30%]" : "w-[62%]")}
                style={{ top: top(e.hour), left: `${e.x}%`, animationDelay: `${150 + EVENTS.indexOf(e) * 28}ms` }}
              />
            ))}
            {day === REPLY.day && (
              <span
                className="absolute left-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-amber-400 shadow animate-pop"
                style={{ top: top(REPLY.hour), animationDelay: "1500ms" }}
                aria-hidden
              />
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-stone-900 px-3.5 py-2.5 text-[14px] leading-snug text-white lg:hidden">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-amber-400" aria-hidden />
        <span>
          <span className="font-semibold">Thursday 14:12, Priya replied.</span> Her two follow-ups were cancelled automatically.
        </span>
      </p>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-stone-600">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <li key={k} className="inline-flex items-center gap-2">
            <span className={cx("h-2 w-4 rounded-full", KIND[k].cls)} /> {KIND[k].label}
          </li>
        ))}
        <li className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" /> Reply
        </li>
      </ul>
    </figure>
  );
}
