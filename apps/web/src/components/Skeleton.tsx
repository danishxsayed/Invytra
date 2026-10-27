import { cx } from "./ui";

/**
 * A placeholder block with a moving shimmer, shown while a page loads.
 * Screen readers hear "Loading" once per screen (see LoadingScreen), not per block.
 */
export function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "relative overflow-hidden rounded-md bg-stone-200/70",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent",
        "motion-reduce:before:hidden",
        className,
      )}
    />
  );
}

/** Text-like lines of varying width. */
export function Lines({ n = 2, className }: { n?: number; className?: string }) {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-7/12"];
  return (
    <div className={cx("space-y-2", className)}>
      {Array.from({ length: n }, (_, i) => (
        <Bone key={i} className={cx("h-3.5", widths[i % widths.length])} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-2xl border border-stone-200/80 bg-white p-5 shadow-card", className)}>{children}</div>;
}

/** Page title (and description), with room for a button on the right. */
export function HeaderSkeleton({ action = true, back = false }: { action?: boolean; back?: boolean }) {
  return (
    <div className="space-y-3">
      {back && <Bone className="h-4 w-24" />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2.5">
          <Bone className="h-8 w-56" />
          <Bone className="h-4 w-80 max-w-[70vw]" />
        </div>
        {action && <Bone className="h-10 w-36 rounded-lg" />}
      </div>
    </div>
  );
}

/** Rows with an avatar, two lines of text and a pill on the right. */
export function RowsSkeleton({ rows = 6, pill = true }: { rows?: number; pill?: boolean }) {
  return (
    <div className="divide-y divide-stone-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <Bone className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Lines n={2} />
          </div>
          {pill && <Bone className="hidden h-6 w-24 rounded-full sm:block" />}
        </div>
      ))}
    </div>
  );
}

/** Wrapper that tells assistive tech the page is loading. */
export function LoadingScreen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading {label}…</span>
      {children}
    </div>
  );
}
