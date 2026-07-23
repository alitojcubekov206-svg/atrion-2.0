import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050507]">
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-white/[0.06] bg-[#050507]/80 px-5 py-3.5 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" className="display text-lg font-semibold tracking-tight text-white">
            ATRION <span className="text-[#a78bfa]">2.0</span>
          </Link>
          <Link
            href="/dashboard"
            className="hidden text-[11px] uppercase tracking-[0.2em] text-[#8f8a82] transition hover:text-white sm:inline"
          >
            Projects
          </Link>
          <Link
            href="/dashboard/design-engine"
            className="text-[11px] uppercase tracking-[0.2em] text-[#a78bfa] transition hover:text-[#c4b5fd]"
          >
            Design Engine
          </Link>
          <Link
            href="/pricing"
            className="hidden text-[11px] uppercase tracking-[0.2em] text-[#8f8a82] transition hover:text-white sm:inline"
          >
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-[#6a6560] sm:inline">
            {user.name}
          </span>
          {user.plan === "pro" ? (
            <span className="rounded border border-[#a78bfa]/35 bg-[#a78bfa]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#a78bfa]">
              PRO
            </span>
          ) : (
            <Link
              href="/pricing"
              className="rounded border border-[#a78bfa]/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#a78bfa] transition hover:bg-[#a78bfa]/10"
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
