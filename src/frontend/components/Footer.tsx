import Link from "next/link";
import EffectsToggle from "@/frontend/components/EffectsToggle";

export default function Footer() {
  return (
    <footer className="border-t border-line px-6 py-10 text-sm text-muted md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
        <p>© {new Date().getFullYear()} Atrion. Независимый проект.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/legal#privacy" className="transition hover:text-fg">
            Конфиденциальность
          </Link>
          <Link href="/legal#terms" className="transition hover:text-fg">
            Условия
          </Link>
          <Link href="/legal#refund" className="transition hover:text-fg">
            Возврат средств
          </Link>
          <Link href="/legal#cookies" className="transition hover:text-fg">
            Cookies
          </Link>
        </nav>
        <EffectsToggle />
      </div>
    </footer>
  );
}
