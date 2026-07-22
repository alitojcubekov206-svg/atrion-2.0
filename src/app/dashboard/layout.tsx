import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#09060f]">
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-violet-400/15 bg-[#09060f]/75 px-5 py-3.5 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
            ATRION <span className="text-violet-300">2.0</span>
          </Link>
          <Link
            href="/dashboard"
            className="hidden text-xs uppercase tracking-[0.18em] text-slate-400 transition hover:text-violet-100 sm:inline"
          >
            Projects
          </Link>
          <Link
            href="/dashboard/design-engine"
            className="text-xs uppercase tracking-[0.18em] text-violet-300/90 transition hover:text-violet-100"
          >
            Design Engine
          </Link>
          <Link
            href="/pricing"
            className="hidden text-xs uppercase tracking-[0.18em] text-slate-400 transition hover:text-violet-100 sm:inline"
          >
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-slate-500 sm:inline">
            {user.name}
          </span>
          {user.plan === "pro" ? (
            <span className="rounded border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
              PRO
            </span>
          ) : (
            <Link
              href="/pricing"
              className="rounded border border-violet-400/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-200 transition hover:bg-violet-400/10"
            >
              Upgrade
            </Link>
          )}
          <LogoutButton />
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
