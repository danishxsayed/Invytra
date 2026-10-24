import { FileWarning } from "lucide-react";

export interface LegalSection {
  title: string;
  /** Paragraphs; a paragraph given as an array is shown as a list. */
  body: (string | string[])[];
}

/** Long-form legal text with a contents list and a visible draft notice. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  const id = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-16">
      <div className="max-w-[760px]">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[54px]">{title}</h1>
        <p className="mt-3 text-[15px] text-stone-500">Last updated {updated}</p>
        <p className="mt-6 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-900">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          This is a draft under legal review. It will be finalised before paid plans go live.
        </p>
        <p className="mt-6 text-[18px] leading-relaxed text-stone-700">{intro}</p>
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Contents" className="hidden lg:block">
          <ol className="sticky top-24 space-y-2 text-[15px]">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#${id(s.title)}`} className="text-stone-500 hover:text-stone-900">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-w-[720px] space-y-10">
          {sections.map((s, i) => (
            <section key={s.title} id={id(s.title)} className="scroll-mt-24">
              <h2 className="font-display text-[24px] font-semibold text-stone-900">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[16px] leading-[1.7] text-stone-700">
                {s.body.map((p, j) =>
                  Array.isArray(p) ? (
                    <ul key={j} className="list-disc space-y-1.5 pl-5 marker:text-stone-400">
                      {p.map((li) => (
                        <li key={li}>{li}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={j}>{p}</p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
