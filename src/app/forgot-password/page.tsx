import type { Metadata } from "next";
import { ForgotGate } from "@/frontend/components/EntryGate";

export const metadata: Metadata = { title: "Сброс пароля" };

export default function ForgotPasswordPage() {
  return <ForgotGate />;
}
