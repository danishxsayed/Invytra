"use client";

import { ChevronLeft, Mic, Phone, Plus, Smartphone, Video } from "lucide-react";
import { useState } from "react";
import { cx } from "../ui";
import { WaBubble, WaChatBackground, type BubbleTemplate } from "./WaBubble";

/** A phone showing the message as the person receives it, in Android (dark) or iPhone (light) look. */
export function WaPhone({ t, values, headerValue, business, caption }: { t: BubbleTemplate; values?: readonly string[]; headerValue?: string; business: string; caption?: string }) {
  const [os, setOs] = useState<"android" | "ios">("android");
  const dark = os === "android";
  const initial = (business || "B").trim().charAt(0).toUpperCase();
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
      <div className={cx("mx-auto w-full max-w-[330px] overflow-hidden rounded-[2.2rem] border-[7px] shadow-xl", dark ? "border-[#1c2328] bg-[#1c2328]" : "border-stone-900 bg-stone-900")}>
        <div className={cx("flex items-center justify-between px-5 pb-1 pt-2 text-[11.5px] font-semibold", dark ? "bg-[#1f2c34] text-[#e9edef]" : "bg-[#f6f6f6] text-stone-900")}>
          <span>10:00</span>
          <span className="flex items-center gap-1" aria-hidden>
            <span className="flex items-end gap-px">
              {[3, 5, 7, 9].map((h) => (
                <span key={h} className="w-[3px] rounded-sm bg-current" style={{ height: h }} />
              ))}
            </span>
            <span className="ml-1 h-2.5 w-5 rounded-[3px] border border-current p-px">
              <span className="block h-full w-3/4 rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        <div className={cx("flex items-center gap-2.5 px-3 py-2.5", dark ? "bg-[#1f2c34] text-[#e9edef]" : "border-b border-stone-200 bg-[#f6f6f6] text-stone-900")}>
          <ChevronLeft className={cx("h-5 w-5", dark ? "" : "text-sky-600")} aria-hidden />
          <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-[13px] font-semibold text-white">{initial}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{business || "Your business"}</span>
            <span className={cx("block text-[11.5px]", dark ? "text-emerald-400" : "text-stone-500")}>online</span>
          </span>
          <Video className={cx("h-4 w-4", dark ? "" : "text-sky-600")} aria-hidden />
          <Phone className={cx("ml-2 h-4 w-4", dark ? "" : "text-sky-600")} aria-hidden />
        </div>
        <WaChatBackground dark={dark} className="h-[540px] overflow-y-auto px-3 py-4">
          <p className={cx("mx-auto mb-3 w-fit rounded-md px-2 py-0.5 text-[11px] font-medium uppercase", dark ? "bg-[#1f2c34] text-[#8696a0]" : "bg-white/90 text-stone-500")}>{caption ?? "Today"}</p>
          <WaBubble t={t} values={values} headerValue={headerValue} dark={dark} />
        </WaChatBackground>
        <div className={cx("flex items-center gap-2 px-2.5 py-2", dark ? "bg-[#0b141a]" : "bg-[#f6f6f6]")}>
          {!dark && <Plus className="h-5 w-5 text-sky-600" aria-hidden />}
          <span className={cx("flex-1 rounded-full px-3.5 py-1.5 text-[12.5px]", dark ? "bg-[#1f2c34] text-[#8696a0]" : "bg-white text-stone-400 ring-1 ring-stone-200")}>Message</span>
          <span className={cx("grid h-8 w-8 place-items-center rounded-full", dark ? "bg-[#00a884] text-white" : "text-sky-600")}>
            <Mic className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}
