import { ExternalLink, Image as ImageIcon, Phone, Reply } from "lucide-react";
import { Fragment } from "react";
import { cx } from "../ui";

/*
 * A template as it looks in WhatsApp: the chat background, the message bubble (header,
 * body, footer, time) and its buttons under it. Used by the template cards and the builder.
 */

export interface BubbleTemplate {
  header: { type: "NONE" } | { type: "TEXT"; text: string } | { type: "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"; src?: string };
  body: string;
  footer: string;
  buttons: { type: string; text: string }[];
}

/** WhatsApp's own formatting (*bold*, _italic_, ~strike~) and {{n}} variables. */
function Rich({ text, values }: { text: string; values?: readonly string[] }) {
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
            <span key={i} className="rounded bg-emerald-100 px-1 font-mono text-[12px] text-emerald-800">
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

const ICON: Record<string, typeof Reply> = { QUICK_REPLY: Reply, URL: ExternalLink, PHONE_NUMBER: Phone };

export function WaBubble({ t, values, headerValue, className }: { t: BubbleTemplate; values?: readonly string[]; headerValue?: string; className?: string }) {
  return (
    <div className={cx("max-w-[310px] text-[13.5px] leading-snug text-stone-800", className)}>
      <div className="rounded-lg rounded-tl-none bg-white p-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
        {t.header.type === "TEXT" && t.header.text && (
          <p dir="auto" className="px-1.5 pt-1 font-semibold">
            <Rich text={t.header.text} values={headerValue ? [headerValue] : undefined} />
          </p>
        )}
        {t.header.type !== "TEXT" && t.header.type !== "NONE" && (
          <div className="mb-1 grid aspect-[2.2] place-items-center overflow-hidden rounded-md bg-stone-200 text-stone-500">
            {"src" in t.header && t.header.src ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
              <img src={t.header.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex items-center gap-1.5 text-[12px] font-medium">
                <ImageIcon className="h-4 w-4" aria-hidden /> {t.header.type.charAt(0) + t.header.type.slice(1).toLowerCase()}
              </span>
            )}
          </div>
        )}
        <p dir="auto" className="whitespace-pre-wrap break-words px-1.5 pt-1">{t.body ? <Rich text={t.body} values={values} /> : <span className="text-stone-400">Your message…</span>}</p>
        <p className="flex items-end justify-between gap-3 px-1.5 pb-0.5 pt-1">
          <span dir="auto" className="text-[12px] text-stone-500">{t.footer}</span>
          <span className="shrink-0 text-[10.5px] text-stone-400">10:00</span>
        </p>
      </div>
      {t.buttons.length > 0 && (
        <div className="mt-1 grid gap-1">
          {t.buttons.slice(0, 3).map((b, i) => {
            const Icon = ICON[b.type] ?? Reply;
            return (
              <span key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[13px] font-medium text-sky-600 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {b.text || "Button"}
              </span>
            );
          })}
          {t.buttons.length > 3 && <span className="rounded-lg bg-white px-2 py-1.5 text-center text-[13px] font-medium text-sky-600 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">See all options</span>}
        </div>
      )}
    </div>
  );
}

/** WhatsApp's chat wallpaper behind a bubble. */
export function WaChatBackground({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx("bg-[#efe7dd]", className)}
      style={{ backgroundImage: "radial-gradient(rgba(120,100,70,0.13) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
    >
      {children}
    </div>
  );
}
