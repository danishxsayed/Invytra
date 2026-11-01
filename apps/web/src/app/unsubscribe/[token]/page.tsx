import { prisma } from "@invytra/db";
import { CheckCircle2, MailX } from "lucide-react";
import { unsubscribeInfo } from "@/lib/unsubscribe";
import { confirmUnsubscribeAction } from "./actions";

export const metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The page behind the unsubscribe link in emails. Opening it doesn't unsubscribe (link
 * scanners open every link); pressing the button does, right away.
 */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const info = await unsubscribeInfo(prisma, token);
  const done = info?.done || (await searchParams).done === "1";
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
        {!info ? (
          <>
            <MailX className="mx-auto h-10 w-10 text-stone-400" aria-hidden />
            <h1 className="mt-3 text-[22px] font-semibold text-stone-900">This link doesn't work</h1>
            <p className="mt-2 text-[15px] text-stone-600">It may have been copied incompletely. Reply to the email with “unsubscribe” and the sender will stop writing to you.</p>
          </>
        ) : done ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-[22px] font-semibold text-stone-900">You're unsubscribed</h1>
            <p className="mt-2 text-[15px] text-stone-600">
              {info.email} won't get any more emails from {info.sender}.
            </p>
          </>
        ) : (
          <>
            <MailX className="mx-auto h-10 w-10 text-stone-500" aria-hidden />
            <h1 className="mt-3 text-[22px] font-semibold text-stone-900">Unsubscribe?</h1>
            <p className="mt-2 text-[15px] text-stone-600">
              Stop all emails from {info.sender} to <strong>{info.email}</strong>.
            </p>
            <form action={confirmUnsubscribeAction.bind(null, token)} className="mt-6">
              <button className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-stone-800">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
