/** The empty reading pane of every inbox (workspace, LinkedIn, email): an illustration and what to do. */
export function PickConversation({ body }: { body: string }) {
  return (
    <div className="flex flex-col items-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG, no resizing needed */}
      <img src="/illustrations/inbox-message.svg" alt="" width={240} height={206} className="h-auto w-[190px] select-none lg:w-[240px]" draggable={false} />
      <h2 className="mt-7 text-[18px] font-semibold tracking-tight text-stone-900">Pick a conversation</h2>
      <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-stone-500">{body}</p>
    </div>
  );
}
