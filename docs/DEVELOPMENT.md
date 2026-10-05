# Запуск и проверка

Для просмотра локально подготовленного полного роста положите экспорт редактора `{name, document}` в `.backend-tests/atrion-fullbody-rig.json` и откройте `/playground/rigging?fixture=fullbody` при `npm run dev`. Это фиксированный путь только для development, без произвольного чтения файлов по URL. Отсутствующий/невалидный файл и production дают 404. Рисунок не включён в Git; пример не подменяет внешний генератор. Черновик примера отделён от обычного редактора и привязан к хешу файла.

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

Без БД можно проверить ручные риги в development: `/playground/rigging?mode=rig2d` и `?mode=rig3d`. В production этот маршрут закрыт через notFound. Это не генератор персонажа по тексту; серверное сохранение требует входа и таблицы DesignDocument.

## Переменные

Все имена и безопасные примеры — в [.env.example](../.env.example). Содержимое настоящего `.env` не копируй в отчёты.

| Переменные | Назначение |
| --- | --- |
| `DATABASE_URL`, `AUTH_SECRET` | База и подпись session/share JWT |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Основной OpenAI-compatible AI; отсутствие ключа включает demo |
| `CHARACTER_IMAGE_PROVIDER` | cloudflare по умолчанию либо openai; автоматического fallback нет |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Аккаунт и токен Workers AI для Cloudflare + FLUX |
| `OPENAI_IMAGE_API_KEY`, `OPENAI_IMAGE_MODEL` | OpenAI Image API при явном выборе openai |
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

## Рисунок персонажа через API

По умолчанию выбран Cloudflare Workers AI + FLUX. В локальном `.env.local` либо серверном окружении задайте `CHARACTER_IMAGE_PROVIDER="cloudflare"`, `CLOUDFLARE_ACCOUNT_ID` и `CLOUDFLARE_API_TOKEN`. Нужны также development-база и `AUTH_SECRET` для входа. Данные доступа не отправляйте в чат или Git. Инструкция получения токена: [Cloudflare REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/); используйте шаблон Workers AI и нужный аккаунт. Значения из примера не являются рабочими ключами.

На Workers Free действует бесплатный суточный лимит; после его исчерпания Cloudflare прекращает запросы. Workers Paid допускает оплату сверх бесплатного лимита. Приложение не определяет тариф Cloudflare и не изменяет его; не включайте Paid для бесплатной проверки. Актуальные условия — [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

OpenAI сохранён как отдельный вариант: явно задайте `CHARACTER_IMAGE_PROVIDER="openai"` и `OPENAI_IMAGE_API_KEY`. Между провайдерами нет автоматического переключения. Каждый успешный рисунок расходует одну внутреннюю AI-квоту Atrion; необработанная ошибка освобождает резерв. В preview вызов отключён. На авторизованной странице проверяйте реальный рисунок, отмену и скачивание: Cloudflare возвращает JPEG с фоном, OpenAI — WebP с запросом прозрачности. Без ключа проверки подтверждают только отказ и поведение тестового транспорта.

Перед Vercel-деплоем требуется проверить Fluid compute для маршрута на 180 секунд. Полный автоматический риг ещё не реализован. Новые данные локальной базы и настройки хостинга автоматически не создаются.
