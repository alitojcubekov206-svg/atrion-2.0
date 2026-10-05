# Запуск и проверка

## Среда

CI использует Node.js 22 и npm. Устанавливай зависимости из `package-lock.json`; tsx не закреплён в devDependencies, поэтому `npx tsx` при отсутствии кэша загружает его. Здесь нет скриптов `npm test` и `npm run lint`; Next-конфигурация отключает ESLint при сборке.

Из корня репозитория в PowerShell:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
npm ci
npm run dev
```

Команду копирования выполняй только если `.env` ещё нет. До запуска заполни `DATABASE_URL` для своей development-базы и случайный `AUTH_SECRET`. Demo AI не заменяет базу и авторизацию. `npm ci` вызывает postinstall с `prisma generate`.

Если схема ещё не применена к выделенной development-базе:

```powershell
npm run db:push
```

Это изменение базы. Сначала проверь выбранное окружение. Новая таблица DesignDocument и DDL описаны в [DESIGN_BACKEND.md](DESIGN_BACKEND.md). В репозитории нет истории Prisma migrations, поэтому `prisma migrate dev` и старый `manual-production-migration.sql` не являются текущим способом запуска.

## Переменные

Все имена и безопасные примеры — в [.env.example](../.env.example). Содержимое настоящего `.env` не копируй в отчёты.

| Переменные | Назначение |
| --- | --- |
| `DATABASE_URL`, `AUTH_SECRET` | База и подпись session/share JWT |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Основной OpenAI-compatible AI; отсутствие ключа включает demo |
| `AI_FALLBACK_API_KEY`, `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_MODEL` | Резервный провайдер; одного fallback-ключа недостаточно для primary |
| `EMAIL_VERIFICATION_ENABLED` | Обязательная проверка email; по умолчанию false |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Доставка кодов; сброс пароля требует настроенного отправителя |
| `EMAIL_DEV_RETURN_CODE` | Возврат кода при неудачной доставке; false в production. Код не ограничивает этот флаг только development |
| `APP_URL` | Абсолютные ссылки, metadata, sitemap |
| `PAYMENT_WHATSAPP` | Номер для ручного контакта по оплате |

Есть также legacy-алиасы `GROQ_API_KEY` и `AI_API_KEY` в `ai.ts`. Не добавляй ключи в клиентские переменные `NEXT_PUBLIC_*`. Доступность моделей, квоты и цены провайдеров нужно проверять отдельно; значения в примере не гарантируют доступ.

## Команды проверки

```powershell
npm run test:backend
npx tsc --noEmit
npm run build
npx tsx scripts/gen-report.ts
npx tsx scripts/csg-smoke.ts
npx tsx scripts/voice-test.ts
git diff --check
```

`test:backend` проверяет FK, keyframes, repeat/mirror/mesh, геометрию проёмов, валидацию документов и потоковый JSON. Проверки не требуют рабочей БД или AI.

`gen-report` показывает геометрию на наборе запросов, но не доказывает визуальное соответствие. `csg-smoke` выводит bounds/вершины трёх булевых операций. `voice-test` проверяет категории голосовых команд. Успешная сборка не проверяет реальную базу, отправку email и AI-ключи. Для production-режима после сборки есть `npm start`.

Для ручной проверки используй отдельные тестовые аккаунты: владение проектом, лимиты, обработку отказов провайдера, email/reset, scene edits, экспорт и reduced motion. Auth rate limiter отключён в `npm run dev`: его поведение проверяй в production-режиме на тестовой среде.

## Выпуск

CI описан в [.github/workflows/ci.yml](../.github/workflows/ci.yml). Автодеплой Vercel заявлен в прежней инструкции, но настройки GitHub/Vercel этим репозиторием не подтверждаются. Перед выпуском отдельно согласуй схему, резервную копию, переменные и способ отката. Не выполняй push или production-операции только ради проверки документации.
