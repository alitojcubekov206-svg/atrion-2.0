import TransitionLink from "@/frontend/components/TransitionLink";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/backend/auth";
import { isEmailVerificationEnabled } from "@/backend/verification";
import LogoutButton from "@/frontend/components/LogoutButton";
import Footer from "@/frontend/components/Footer";

const NAV = [
  { href: "/dashboard", label: "Проекты", always: false },
  { href: "/dashboard/design-engine", label: "Design Engine", always: true },
  { href: "/dashboard/settings", label: "Настройки", always: false },
  { href: "/pricing", label: "Тарифы", always: false },
];

function formatDate(date: Date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isEmailVerificationEnabled() && !user.emailVerified) redirect("/verify");

  const isPro = user.plan === "pro";

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-bg">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
        <nav className="flex items-center justify-between px-5 py-3.5 md:px-10" aria-label="Основная навигация">
          <div className="flex items-center gap-5 md:gap-8">
            <TransitionLink href="/" className="display text-lg font-semibold tracking-tight text-white">
              ATRION <span className="text-accent">2.0</span>
            </TransitionLink>
            {NAV.map((item) => (
              <TransitionLink
                key={item.href}
                href={item.href}
                className={`text-[11px] uppercase tracking-[0.2em] transition ${
                  item.always ? "text-accent hover:text-accent2" : "hidden text-muted hover:text-white sm:inline"
                }`}
              >
                {item.label}
              </TransitionLink>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted sm:inline">
              {user.name}
            </span>
            {isPro ? (
              <span
                title={user.planExpiresAt ? `Pro до ${formatDate(user.planExpiresAt)}` : "Pro"}
                className="rounded border border-accent/35 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent"
              >
                PRO
              </span>
            ) : (
              <TransitionLink
                href="/pricing"
                className="rounded border border-accent/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent transition hover:bg-accent/10"
              >
                Улучшить
              </TransitionLink>
            )}
            <LogoutButton />
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
