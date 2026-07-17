import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="mb-8 text-lg font-semibold">
        Atrion <span className="text-accent">2.0</span>
      </Link>
      <AuthForm mode="register" />
    </main>
  );
}
