import type { Metadata } from "next";
import { RegisterGate } from "@/frontend/components/EntryGate";

export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return <RegisterGate />;
}
