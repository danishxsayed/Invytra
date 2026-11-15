import { Copy, ExternalLink, FileText, Image as ImageIcon, Phone, Play, Reply } from "lucide-react";
import { Fragment } from "react";
import { cx } from "../ui";

/*
 * A template as it looks in WhatsApp: the chat background, the message bubble (header,
 * body, footer, time) and its buttons under it, in WhatsApp's light (iPhone) or dark
 * (Android) look. Used by the template cards, the builders and the campaign pages.
 */

export interface BubbleTemplate {
  header: { type: "NONE" } | { type: "TEXT"; text: string } | { type: "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"; src?: string; fileName?: string };
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
}

/** WhatsApp's own formatting (*bold*, _italic_, ~strike~) and {{n}} variables. */
function Rich({ text, values, dark }: { text: string; values?: readonly string[]; dark?: boolean }) {
  const parts = text.split(/(\{\{\s*\d+\s*\}\}|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return (
    <>
      {parts.map((p, i) => {
        const v = /^\{\{\s*(\d+)\s*\}\}$/.exec(p);
        if (v) {
          const filled = values?.[Number(v[1]) - 1]?.trim();
          return filled ? (
            <Fragment key={i}>{filled}</Fragment>
          ) : (
            <span key={i} className={cx("rounded px-1 font-mono text-[12px]", dark ? "bg-emerald-400/20 text-emerald-200" : "bg-emerald-100 text-emerald-800")}>
              {p.replace(/\s/g, "")}
            </span>
          );
        }
        if (/^\*.+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_.+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        if (/^~.+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const ICON: Record<string, typeof Reply> = { QUICK_REPLY: Reply, URL: ExternalLink, PHONE_NUMBER: Phone, COPY_CODE: Copy, OTP: Copy };

export function WaBubble({ t, values, headerValue, dark, className }: { t: BubbleTemplate; values?: readonly string[]; headerValue?: string; dark?: boolean; className?: string }) {
  const card = dark ? "bg-[#1f2c34] text-[#e9edef] shadow-none" : "bg-white text-stone-800 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]";
  const muted = dark ? "text-[#8696a0]" : "text-stone-500";
  const h = t.header;
  return (
    <div className={cx("max-w-[310px] text-[13.5px] leading-snug", className)}>
      <div className={cx("rounded-lg rounded-tl-none p-1.5", card)}>
        {h.type === "TEXT" && h.text && (
          <p dir="auto" className="px-1.5 pt-1 font-semibold">
            <Rich text={h.text} values={headerValue ? [headerValue] : undefined} dark={dark} />
          </p>
        )}
        {(h.type === "IMAGE" || h.type === "VIDEO" || h.type === "LOCATION") && (
          <div className={cx("relative mb-1 grid aspect-[2.2] place-items-center overflow-hidden rounded-md", dark ? "bg-[#2a3942] text-[#8696a0]" : "bg-stone-200 text-stone-500")}>
            {h.src && h.type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
              <img src={h.src} alt="" className="h-full w-full object-cover" />
            ) : h.src && h.type === "VIDEO" ? (
              <video src={h.src} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-medium">
                <ImageIcon className="h-4 w-4" aria-hidden /> {h.type === "VIDEO" ? "Video" : h.type === "LOCATION" ? "Location" : "Image"}
              </span>
            )}
            {h.type === "VIDEO" && (
              <span className="absolute grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white">
                <Play className="h-4 w-4 fill-current" aria-hidden />
              </span>
            )}
          </div>
        )}
        {h.type === "DOCUMENT" && (
          <div className={cx("mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2", dark ? "bg-[#2a3942]" : "bg-stone-100")}>
            <span className="grid h-8 w-7 place-items-center rounded bg-rose-500 text-[9px] font-bold text-white">PDF</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{h.fileName || "Document.pdf"}</span>
              <span className={cx("block text-[11px]", muted)}>PDF</span>
            </span>
            <FileText className={cx("ml-auto h-4 w-4", muted)} aria-hidden />
          </div>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words px-1.5 pt-1">
          {t.body ? <Rich text={t.body} values={values} dark={dark} /> : <span className={muted}>Your message…</span>}
        </p>
        <p className="flex items-end justify-between gap-3 px-1.5 pb-0.5 pt-1">
          <span dir="auto" className={cx("text-[12px]", muted)}>
            {t.footer}
          </span>
          <span className={cx("shrink-0 text-[10.5px]", muted)}>10:00</span>
        </p>
      </div>
      {t.buttons.length > 0 && (
        <div className="mt-1 grid gap-1">
          {t.buttons.slice(0, 3).map((b, i) => {
            const Icon = ICON[b.type] ?? Reply;
            return (
              <span key={i} className={cx("flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium", card, dark ? "text-[#53bdeb]" : "text-sky-600")}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {b.text || "Button"}
              </span>
            );
          })}
          {t.buttons.length > 3 && <span className={cx("rounded-lg px-2 py-1.5 text-center text-[13px] font-medium", card, dark ? "text-[#53bdeb]" : "text-sky-600")}>See all options</span>}
        </div>
      )}
    </div>
  );
}

/** WhatsApp's chat wallpaper behind a bubble. */
export function WaChatBackground({ children, className, dark }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div
      className={cx(dark ? "bg-[#0b141a]" : "bg-[#efe7dd]", className)}
      style={{ backgroundImage: `radial-gradient(${dark ? "rgba(255,255,255,0.06)" : "rgba(120,100,70,0.13)"} 1px, transparent 1px)`, backgroundSize: "14px 14px" }}
    >
      {children}
    </div>
  );
}
