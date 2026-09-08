import type { Metadata } from "next";
import { LoginGate } from "@/frontend/components/EntryGate";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return <LoginGate />;
}
