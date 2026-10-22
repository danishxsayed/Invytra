export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-between bg-ink px-8 py-10 text-white lg:px-14 lg:py-14">
        <span className="text-xl font-bold tracking-tight">Invytra</span>
        <div className="my-12 max-w-md lg:my-0">
          <p className="text-2xl font-semibold leading-snug">
            Your LinkedIn outreach, running on its own — inside the limits that keep accounts safe.
          </p>
          <div className="mt-8 flex gap-[3px]" aria-hidden>
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className={`h-4 flex-1 rounded-[1px] ${i < 7 ? "bg-[#5FB89F]" : "bg-white/15"}`} />
            ))}
          </div>
          <p className="mt-2 text-sm text-white/60">7 of 20 invites sent today. The rest wait for tomorrow.</p>
        </div>
        <span className="text-sm text-white/50">Built by Crawlers Technologies</span>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
