import type { Metadata } from "next";
import { Manrope, Unbounded } from "next/font/google";
import MotionProvider from "@/frontend/components/MotionProvider";
import PageWipeProvider from "@/frontend/components/PageWipe";
import { siteUrl } from "@/backend/site";
import "./globals.css";

const body = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const SITE_URL = siteUrl();
const SITE_DESCRIPTION =
  "Atrion понимает человека и создаёт вместе с ним: 3D-объекты, архитектура и intelligent design в браузере.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Atrion — AI Design Engine",
    template: "%s · Atrion",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Atrion",
    title: "Atrion — AI Design Engine",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Atrion — AI Design Engine",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${body.variable} ${display.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        <MotionProvider>
          <PageWipeProvider>{children}</PageWipeProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
