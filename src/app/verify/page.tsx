import { redirect } from "next/navigation";
import { getCurrentUser } from "@/backend/auth";
import { isEmailVerificationEnabled } from "@/backend/verification";
import VerifyForm from "@/frontend/components/VerifyForm";

export default async function VerifyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isEmailVerificationEnabled() || user.emailVerified) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050507] px-6">
      <div className="relative z-10 w-full max-w-sm">
        <h1 className="display text-3xl font-semibold text-white">Подтвердите email</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#8f8a82]">
          Мы отправили код на <span className="text-white">{user.email}</span>. Введите его ниже.
        </p>
        <VerifyForm />
      </div>
    </main>
  );
}
