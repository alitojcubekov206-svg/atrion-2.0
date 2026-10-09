import Link from "next/link";
import type {Metadata} from "next";
import Footer from "@/frontend/components/Footer";
export const metadata: Metadata = {title: "Бесплатный доступ"};
export default function PricingPage() {
  return <><main className="mx-auto min-h-screen max-w-3xl px-6 py-16"><Link href="/" className="display text-lg">ATRION 2.0</Link><h1 className="display mt-12 text-4xl font-semibold">Все функции бесплатно</h1><p className="mt-5 text-muted">Создавайте проекты и 3D-модели, редактируйте дизайн и скачивайте результаты без подписки и оплаты.</p><div className="mt-8 flex flex-wrap gap-4"><Link href="/dashboard/design-engine" className="btn-primary rounded-xl px-5 py-3">Создать 3D</Link><Link href="/dashboard/design" className="btn-ghost rounded-xl px-5 py-3">Дизайн интерьера</Link></div></main><Footer/></>;
}
