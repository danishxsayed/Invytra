import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { logout } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="mx-auto grid min-h-screen max-w-[1280px] lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-line px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:mb-8 lg:block">
          <span className="text-lg font-bold tracking-tight">Invytra</span>
          <p className="ml-auto truncate text-sm text-ink-soft lg:ml-0 lg:mt-1">{me.workspace.name}</p>
          <form action={logout} className="lg:hidden">
            <button className="text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline">Log out</button>
          </form>
        </div>
        <Nav />
        <div className="mt-6 hidden border-t border-line pt-4 lg:absolute lg:bottom-6 lg:left-4 lg:right-4 lg:block">
          <p className="truncate text-sm font-medium">{me.user.name}</p>
          <p className="truncate text-sm text-ink-faint">{me.user.email}</p>
          <form action={logout}>
            <button className="mt-2 text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline">Log out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
