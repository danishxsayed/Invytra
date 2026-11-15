"use client";

import { BadgeCheck, BatteryFull, ChevronLeft, EllipsisVertical, Paperclip, Phone, SendHorizontal, Smartphone, Smile, Video, Wifi } from "lucide-react";
import { useState } from "react";
import { cx } from "../ui";
import { WaBubble, WaChatBackground, type BubbleTemplate } from "./WaBubble";

/** The business as people see it at the top of the chat. photo is Meta's (short-lived) profile picture link. */
export interface ChatBusiness {
  name: string;
  photo?: string | null;
  /** Meta's green verified badge (an Official Business Account) */
  official?: boolean;
}

/** A phone showing the message as the person receives it, in Android (dark) or iPhone (light) look. */
export function WaPhone({ t, values, headerValue, business, caption }: { t: BubbleTemplate; values?: readonly string[]; headerValue?: string; business: ChatBusiness; caption?: string }) {
  const [os, setOs] = useState<"android" | "ios">("android");
  const [photoFailed, setPhotoFailed] = useState(false);
  const dark = os === "android";
  const name = business.name.trim() || "Your business";
  const accent = dark ? "text-[#e9edef]" : "text-sky-600";
  const bar = dark ? "bg-[#1f2c34] text-[#e9edef]" : "bg-[#f6f6f6] text-stone-900";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["android", "ios"] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOs(o)}
            aria-pressed={os === o}
            className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold ring-1 transition", os === o ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-white text-stone-500 ring-stone-200 hover:text-stone-800")}
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden /> {o === "android" ? "Android" : "iOS"}
          </button>
        ))}
        <span className="ml-auto text-[11.5px] font-semibold uppercase tracking-wider text-stone-400">Preview</span>
      </div>
      <div className={cx("mx-auto w-full max-w-[330px] overflow-hidden rounded-[2.4rem] border-[7px] shadow-xl", dark ? "border-[#1c2328] bg-[#1c2328]" : "border-stone-900 bg-stone-900")}>
        {/* status bar */}
        <div className={cx("flex items-center justify-between px-6 pb-1 pt-2.5 text-[12.5px] font-semibold", bar)}>
          <span>10:00</span>
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M12 0v12H0z" />
            </svg>
            <Wifi className="h-3.5 w-3.5" strokeWidth={2.5} />
            <BatteryFull className="h-4 w-4" strokeWidth={2} />
          </span>
        </div>
        {/* chat header */}
        <div className={cx("flex items-center gap-2 px-2 py-2.5", bar, !dark && "border-b border-stone-200")}>
          <ChevronLeft className={cx("-mr-1 h-6 w-6 shrink-0", accent)} strokeWidth={1.75} aria-hidden />
          {business.photo && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- Meta's CDN link, short-lived
            <img src={business.photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#5fcf7e] text-[15px] font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
          )}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1">
              <span className="truncate text-[14.5px] font-semibold">{name}</span>
              {business.official && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#25d366] text-white" aria-label="Verified business" />}
            </span>
            <span className={cx("block text-[12px]", dark ? "text-[#5fcf7e]" : "text-stone-500")}>online</span>
          </span>
          <Video className={cx("h-5 w-5 shrink-0", accent)} strokeWidth={1.75} aria-hidden />
          <Phone className={cx("ml-1.5 h-[18px] w-[18px] shrink-0", accent)} strokeWidth={1.75} aria-hidden />
          {dark && <EllipsisVertical className="-ml-0.5 h-5 w-5 shrink-0" aria-hidden />}
        </div>
        <WaChatBackground dark={dark} className="h-[540px] overflow-y-auto px-3 py-4">
          <p className={cx("mx-auto mb-3 w-fit rounded-md px-2 py-0.5 text-[11px] font-medium uppercase", dark ? "bg-[#1f2c34] text-[#8696a0]" : "bg-white/90 text-stone-500")}>{caption ?? "Today"}</p>
          <WaBubble t={t} values={values} headerValue={headerValue} dark={dark} />
        </WaChatBackground>
        {/* message bar */}
        <div className={cx("flex items-center gap-2 px-2 pb-3 pt-2", dark ? "bg-[#0b141a]" : "bg-[#f6f6f6]")}>
          <span className={cx("flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-3 py-2.5", dark ? "bg-[#1f2c34] text-[#8696a0]" : "bg-white text-stone-400 ring-1 ring-stone-200")}>
            <Smile className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="flex-1 truncate text-[14px]">Type a message</span>
            <Paperclip className="h-[18px] w-[18px] shrink-0 -rotate-45" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#21a67a] text-white" aria-hidden>
            <SendHorizontal className="h-5 w-5 fill-current" />
          </span>
        </div>
      </div>
    </div>
  );
}
