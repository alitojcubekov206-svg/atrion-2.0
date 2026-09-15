import Link from "next/link";
import type { Metadata } from "next";
import { PLANS, PRO_DURATION_DAYS } from "@/backend/plans";

export const metadata: Metadata = { title: "Правовая информация" };

export default function LegalPage() {
  const wa = process.env.PAYMENT_WHATSAPP;
  const waLink = wa ? `https://wa.me/${wa}` : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-sm leading-relaxed text-muted">
      <Link href="/" className="display text-lg font-semibold tracking-tight text-fg">
        ATRION <span className="text-accent">2.0</span>
      </Link>

      <h1 className="display mt-8 text-3xl font-semibold text-fg">Правовая информация</h1>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted/70">
        Обновлено: 15 сентября 2026
      </p>
      <p className="mt-3">
        Atrion сейчас — независимый проект, а не зарегистрированная компания. Здесь честно
        описано, какие данные мы собираем, как обрабатываются платежи и как с нами связаться.
        Эта страница будет расширена по мере роста проекта.
      </p>

      <section id="privacy" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Политика конфиденциальности</h2>
        <p className="mt-3">
          Мы собираем минимум данных, необходимых для работы сервиса: имя, email и хэш пароля
          при регистрации. Пароли хранятся в виде хэша (bcrypt) и никогда — в открытом виде.
        </p>
        <p className="mt-3">
          Оплата Pro сейчас проходит вручную - переводом через Mbank / O!Деньги / Элсом по
          договорённости в WhatsApp. Мы не подключаем сторонние платёжные сервисы и не
          обрабатываем и не храним данные карт.
        </p>
        <p className="mt-3">
          Мы не передаём ваши данные третьим лицам. Мы не используем рекламные или
          аналитические cookie - см.{" "}
          <a href="#cookies" className="text-accent hover:underline">раздел про cookie</a> ниже.
        </p>
        <p className="mt-3">
          Вы можете запросить удаление своего аккаунта и данных в любой момент — напишите нам
          {waLink ? (
            <>
              {" "}в{" "}
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                WhatsApp
              </a>
            </>
          ) : (
            " через контакты ниже"
          )}
          .
        </p>
      </section>

      <section id="terms" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Условия использования</h2>
        <p className="mt-3">
          Atrion — сервис в активной разработке. Функциональность, лимиты бесплатного плана и
          доступность отдельных функций (включая AI-генерацию) могут меняться без предварительного
          уведомления. Мы не гарантируем бесперебойную работу или сохранность сгенерированного
          контента и рекомендуем экспортировать важные проекты (Markdown / JSON / PDF).
        </p>
        <p className="mt-3">
          Используя Atrion, вы подтверждаете, что предоставленные при регистрации данные (имя,
          email) верны, и обязуетесь не использовать сервис для незаконной деятельности.
        </p>
      </section>

      <section id="refund" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Возврат средств</h2>
        <p className="mt-3">
          План {PLANS.pro.name} стоит {PLANS.pro.price} за {PRO_DURATION_DAYS} дней доступа.
          Если оплата прошла, но доступ Pro не активировался в течение часа, или вы передумали в
          течение 24 часов после оплаты и ещё не пользовались функциями Pro — мы вернём деньги
          в полном объёме.
        </p>
        <p className="mt-3">
          Для возврата напишите нам
          {waLink ? (
            <>
              {" "}в{" "}
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                WhatsApp
              </a>
            </>
          ) : (
            " через контакты ниже"
          )}{" "}
          с датой и суммой платежа.
        </p>
      </section>

      <section id="cookies" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Файлы cookie</h2>
        <p className="mt-3">
          Мы используем только один обязательный (strictly necessary) cookie — сессию входа
          (подписанный JWT), без которого вход в аккаунт невозможен. Мы не используем
          рекламные, маркетинговые или аналитические cookie.
        </p>
        <p className="mt-3">
          Если в будущем мы добавим аналитику, перед этим появится баннер с запросом согласия.
        </p>
      </section>

      <section id="contact" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Контакты</h2>
        <p className="mt-3">
          {waLink ? (
            <>
              Свяжитесь с нами в{" "}
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                WhatsApp
              </a>
              .
            </>
          ) : (
            "Контактный канал сейчас настраивается."
          )}
        </p>
      </section>

      <Link href="/" className="mt-14 inline-block text-accent hover:underline">
        ← На главную
      </Link>
    </main>
  );
}
