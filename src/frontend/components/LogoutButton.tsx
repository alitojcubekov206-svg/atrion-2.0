"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({
  className = "rounded-full border border-line px-4 py-1.5 text-muted transition hover:border-accent hover:text-fg",
  children = "Выйти",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={logout} className={className}>
      {children}
    </button>
  );
}
