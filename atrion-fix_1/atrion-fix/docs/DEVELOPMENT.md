# Запуск и проверка серверного этапа

CI использует Node.js 22 и зависимости из `package-lock.json`. Для запуска нужны development `DATABASE_URL` и `AUTH_SECRET`; локальный fallback AI не заменяет базу и сессии. Не копируйте секреты в Git. `npm ci` и `npm run build` выполняют только `prisma generate`, без изменения схемы БД.

## Схема БД: Prisma Migrate вместо `db push`

`prisma db push` не оставляет истории изменений схемы и годится только для прототипа. Перед новыми таблицами (режим «Дизайн») рабочая база переводится на миграции один раз — «baseline». Все команды запускаются по прямому подключению Neon (строка без `-pooler` в имени хоста, переменная `DATABASE_URL_UNPOOLED`): через пулер Prisma Migrate падает с ошибками вида `prepared statement "s0" already exists`.

1. Убедиться, что рабочая база совпадает со `schema.prisma` (вывод должен быть пустым):
   `npx prisma migrate diff --from-url "$DATABASE_URL_UNPOOLED" --to-schema-datamodel prisma/schema.prisma --script`
2. Создать стартовую миграцию из текущей схемы:
   `mkdir -p prisma/migrations/0_init`
   `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
3. Отметить её применённой в рабочей базе (таблицы не меняются, создаётся служебная `_prisma_migrations`):
   `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate resolve --applied 0_init`
4. Закоммитить `prisma/migrations/`.

Дальше: изменение схемы — на отдельной ветке Neon (`DATABASE_URL="<прямая строка ветки>" npm run db:migrate -- --name <имя>`), выкатка в рабочую базу — `DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:deploy`. `db:push` остаётся только для локальной временной базы.

Реалистичный режим работает в приложении Modal `infra/modal_realistic.py`. Развёртывание (нужны Python и `pip install modal`, вход `modal token new`): `modal secret create atrion-realistic ATRION_SECRET=<случайная строка>`, затем `modal deploy infra/modal_realistic.py`. Адрес эндпоинта (`https://<workspace>--atrion-realistic-web.modal.run`) укажите в `MODAL_REALISTIC_URL`, тот же секрет — в `MODAL_REALISTIC_SECRET` (только на сервере, в Vercel). Первый запуск скачивает модели (~20 ГБ) в Volume. Для GPU Modal требует карту в аккаунте; лимит использования и spend limit в настройках биллинга не дают выйти за бесплатный кредит. В `/playground/generator` можно открыть любой GLB по ссылке и проверить перевод в mesh-деталь без входа.

Для текстового AI настройте серверные `AI_TEXT_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` и при необходимости `CLOUDFLARE_TEXT_MODEL`. Значения Account ID и токена в `.env.example` пустые. `auto` сначала выбирает прежние OPENAI/GROQ/AI-ключи, затем Cloudflare; `cloudflare` выбирает только Workers AI; `disabled` отключает внешнюю генерацию. Ключи не должны иметь префикс `NEXT_PUBLIC_`.

Провайдер использует [официальный OpenAI-compatible endpoint Cloudflare](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) и [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/). Модель по умолчанию — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Внутренние квоты Atrion и лимиты аккаунта Cloudflare независимы. Настройки локальной машины не переносятся в Vercel автоматически.

```powershell
npm ci
npm run test:backend
npx tsx --test scripts/ai-geometry-prompts.test.ts
npx tsc --noEmit
npm run build
npx tsx scripts/gen-report.ts
npx tsx scripts/gen-check.ts
git diff --check
```

`test:backend` компилирует и запускает проверки текстового провайдера, планировки/проёмов, квоты/отмены и потокового тела. Проверки AI-геометрии запускаются отдельно через tsx с поддержкой путей TypeScript. Сами тесты не вызывают AI и не используют рабочую БД; при отсутствии локального tsx команда npx загружает инструмент. `gen-report` проверяет процедурный генератор, а не качество реального AI. `gen-check` — регрессионные проверки разбора запроса, процедурных моделей и правил приёма AI-геометрии без вызова AI; при ошибке завершается с ненулевым кодом. Для затронутых CSG или голосового парсера используются `npx tsx scripts/csg-smoke.ts` и `npx tsx scripts/voice-test.ts`; в этом этапе они не менялись.

После `npm run dev` можно проверить отказ без сессии: `POST /api/house/generate` должен вернуть 401. Для успешного вызова нужны настоящая тестовая сессия, доступная квота и провайдер. API принимает `prompt`, возвращает `name`, `document`, `warnings`, `source`. Ошибки: 400 — некорректное описание/тело, 401 — нет входа, 413 — тело больше 1 MiB, 422 — неподдерживаемое задание, 429 — квота/частота, 499 — отмена, 502 — некорректная выдача, 503 — отсутствует настройка AI. Ответ не сохраняется в БД; новая таблица не нужна. Формы дома в основной ветке нет; dev-маршрут `/playground/generator` показывает только процедурный 3D-генератор.

Для 3D проверяйте реальный запрос, геометрию, материалы и экспорт существующего редактора отдельно от сборки. GLB можно импортировать через [Unity glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/ImportEditor.html). Проверка файла загрузчиком не доказывает успешную проверку в Unity Editor; skinning, коллайдеры и LOD автоматически не добавляются.
