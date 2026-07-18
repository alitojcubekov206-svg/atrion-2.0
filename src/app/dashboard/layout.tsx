import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <nav className="glass sticky top-0 z-50 flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Atrion <span className="text-accent">2.0</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-muted transition hover:text-fg">
            My Projects
          </Link>
          <Link href="/dashboard/3d-studio" className="text-sm text-muted transition hover:text-accent2">
            3D Studio
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-muted sm:inline">{user.name}</span>
          <LogoutButton />
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
