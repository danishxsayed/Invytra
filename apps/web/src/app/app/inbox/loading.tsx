import { Bone, Lines, RowsSkeleton } from "@/components/Skeleton";

/** The inbox while it loads: the two panes, full height. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="h-full overflow-hidden bg-white lg:grid lg:grid-cols-[380px_1fr]">
      <span className="sr-only">Loading inbox…</span>
      <div className="flex h-full flex-col border-stone-200/80 lg:border-r">
        <div className="space-y-2 border-b border-stone-100 p-3">
          <Bone className="h-9 w-full rounded-lg" />
          <div className="flex gap-2">
            <Bone className="h-9 flex-1 rounded-lg" />
            <Bone className="h-9 flex-1 rounded-lg" />
          </div>
        </div>
        <div className="flex gap-1.5 border-b border-stone-100 px-3 py-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <RowsSkeleton rows={7} pill={false} />
      </div>
      <div className="hidden h-full flex-col lg:flex">
        <div className="flex items-center gap-3 border-b border-stone-100 px-6 py-4">
          <Bone className="h-11 w-11 rounded-full" />
          <Lines n={2} className="flex-1" />
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Bone className="h-14 w-2/5 rounded-2xl" />
          <Bone className="ml-auto h-20 w-1/2 rounded-2xl" />
          <Bone className="h-12 w-1/3 rounded-2xl" />
        </div>
        <div className="border-t border-stone-100 p-4">
          <Bone className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
