import { existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { SITE_IMAGES, type SiteImageId } from "@/lib/site-images";
import { cx } from "../ui";

const EXTENSIONS = ["webp", "png", "jpg", "jpeg", "avif"];

/** The file in public/site/ for this image, if the designer has added it. */
function fileFor(id: string): string | null {
  const dir = join(process.cwd(), "public", "site");
  const f = EXTENSIONS.map((e) => `${id}.${e}`).find((n) => existsSync(join(dir, n)));
  return f ? `/site/${f}` : null;
}

/**
 * An image on the website: the real file once it's in public/site/, else a labelled
 * placeholder (name, size, what to make) so the layout is final before the images are.
 */
export function ImageSlot({ id, className, priority, sizes }: { id: SiteImageId; className?: string; priority?: boolean; sizes?: string }) {
  const s = SITE_IMAGES[id];
  const src = fileFor(id);
  if (src) {
    return <Image src={src} alt={s.alt} width={s.w} height={s.h} priority={priority} sizes={sizes ?? "(min-width: 1024px) 50vw, 100vw"} className={cx("h-full w-full object-cover", className)} />;
  }
  return (
    <div
      role="img"
      aria-label={s.alt}
      style={{ aspectRatio: `${s.w} / ${s.h}` }}
      className={cx(
        "relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-[linear-gradient(135deg,#f4f7e8,#e9efd2)] p-5 text-center",
        "bg-[length:100%_100%] [background-image:radial-gradient(rgba(94,122,6,.16)_1px,transparent_1px),linear-gradient(135deg,#f6f9ea,#e6edcc)] [background-size:14px_14px,100%_100%]",
        className,
      )}
    >
      <ImageIcon className="h-6 w-6 text-brand-700/70" aria-hidden />
      <p className="font-mono text-[12px] font-medium text-brand-800">
        {id}.webp · {s.w}×{s.h}
      </p>
      <p className="max-w-[340px] text-[12.5px] leading-snug text-stone-500">{s.brief}</p>
    </div>
  );
}
