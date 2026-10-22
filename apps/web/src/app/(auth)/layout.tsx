import { ShieldCheck, Sparkles, Timer } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-brand-200/60 blur-[120px]" />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-[24rem] w-[24rem] rounded-full bg-sky-100 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "radial-gradient(rgba(24,24,27,0.08) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        />
      </div>
      <div className="relative w-full max-w-[400px] animate-fade-up">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-base font-bold text-white shadow-glow">
            I
          </span>
          <span className="text-xl font-semibold tracking-tight">Invytra</span>
        </div>
        <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-7 shadow-pop backdrop-blur">{children}</div>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-zinc-500">
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Safe daily limits
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Human-like pacing
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden /> Runs while you sleep
          </li>
        </ul>
      </div>
    </main>
  );
}
