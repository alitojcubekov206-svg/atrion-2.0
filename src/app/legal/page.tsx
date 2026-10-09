import Link from "next/link";
import type { Metadata } from "next";

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
        Обновлено: 9 октября 2026
      </p>
      <p className="mt-3">
        Atrion сейчас — независимый проект, а не зарегистрированная компания. Здесь честно
        описано, какие данные мы собираем, как предоставляется бесплатный доступ и как с нами связаться.
        Эта страница будет расширена по мере роста проекта.
      </p>

      <section id="privacy" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Политика конфиденциальности</h2>
        <p className="mt-3">
          Мы собираем минимум данных, необходимых для работы сервиса: имя, email и хэш пароля
          при регистрации. Пароли хранятся в виде хэша (bcrypt) и никогда — в открытом виде.
        </p>
        <p className="mt-3">
          При входе через Google Atrion получает имя, подтверждённый email и идентификатор
          Google-аккаунта. Они сохраняются для создания аккаунта, повторного входа и привязки
          к существующему аккаунту с тем же подтверждённым email. Токен Google проверяется
          при входе и не сохраняется. Доступ к письмам, контактам и файлам Google не запрашивается.
        </p>
        <p className="mt-3">
          Данные Google-входа используются для работы аккаунта и не используются для рекламы
          или обучения моделей. Чтобы запросить удаление аккаунта и привязки Google, напишите
          на{" "}
          <a href="mailto:masterstvo050@gmail.com" className="text-accent hover:underline">masterstvo050@gmail.com</a>
          . Также можно отозвать доступ Atrion в настройках Google-аккаунта; это не удаляет
          сохранённые проекты в Atrion автоматически.
        </p>
        <p className="mt-3">
          Все функции Atrion доступны бесплатно. Платёжные данные для использования сервиса не нужны.
        </p>
        <p className="mt-3">
          Для работы сервиса используются хостинг Vercel и база данных Neon. Google
          обрабатывает вход через Google, а Brevo доставляет письма подтверждения и
          восстановления доступа. Мы не продаём данные и не используем рекламные или
          аналитические cookie — см.{" "}
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
          Atrion — сервис в активной разработке. Функциональность и
          доступность отдельных функций (включая AI-генерацию) могут меняться без предварительного
          уведомления. Мы не гарантируем бесперебойную работу или сохранность сгенерированного
          контента и рекомендуем экспортировать важные проекты (Markdown / JSON / PDF).
        </p>
        <p className="mt-3">
          Используя Atrion, вы подтверждаете, что предоставленные при регистрации данные (имя,
          email) верны, и обязуетесь не использовать сервис для незаконной деятельности.
        </p>
      </section>

      <section id="access" className="mt-12 scroll-mt-24"><h2 className="display text-xl font-semibold text-fg">Бесплатный доступ</h2><p className="mt-3">Подписка и оплата не требуются. Для работы с личными проектами нужен аккаунт.</p></section>

      <section id="cookies" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Файлы cookie</h2>
        <p className="mt-3">
          Для входа используется обязательная cookie сессии atrion_session (подписанный JWT)
          со сроком до 30 дней. Google-вход дополнительно использует временную cookie
          atrion_google_challenge на 10 минут для проверки ответа Google и защиты запроса.
          После проверки она очищается. Эти cookie недоступны JavaScript на странице.
          Рекламные, маркетинговые и аналитические cookie Atrion не использует.
        </p>
        <p className="mt-3">
          Если в будущем мы добавим аналитику, перед этим появится баннер с запросом согласия.
        </p>
      </section>

      <section id="contact" className="mt-12 scroll-mt-24">
        <h2 className="display text-xl font-semibold text-fg">Контакты</h2>
        <p className="mt-3">
          Поддержка Atrion:{" "}
          <a href="mailto:masterstvo050@gmail.com" className="text-accent hover:underline">masterstvo050@gmail.com</a>.
        </p>
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
            "Вопросы о входе и запросы об удалении данных принимаются по email поддержки."
          )}
        </p>
      </section>

      <Link href="/" className="mt-14 inline-block text-accent hover:underline">
        ← На главную
      </Link>
    </main>
  );
}
