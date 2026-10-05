import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GeneratorPlayground from "@/frontend/components/GeneratorPlayground";

export const metadata: Metadata = { title: "Generator playground", robots: { index: false } };

// Dev-only sandbox for the parametric 3D generator: no account, no AI, no quota.
// /playground/generator?p=<prompt> opens straight on a prompt.
export default async function GeneratorPlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { p } = await searchParams;
  return <GeneratorPlayground initialPrompt={p} />;
}
