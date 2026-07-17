import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Atrion 2.0 — Your AI Software Architect",
  description:
    "From Idea to Intelligent Architecture. Atrion turns your raw product idea into a complete technical plan: architecture, database, API, roadmap and honest scoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
