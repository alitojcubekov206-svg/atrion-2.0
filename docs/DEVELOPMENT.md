# Запуск и проверка серверного этапа

Локальная нейросеть без GPU: [LOCAL_AI.md](LOCAL_AI.md). Для неё отдельно запустите `npm run design:ai`; в `.env.local` задайте `LOCAL_DESIGN_AI_URL=http://127.0.0.1:8081`. `/playground/interior` поддерживает этот режим без БД; старые правила также доступны.

Локальная проверка материалов и мебели: `/playground/interior`. Отдельный интерфейс FORMA удалён; подготовленная схема старых документов и текущие ограничения — [FORMA_INTEGRATION.md](FORMA_INTEGRATION.md).

Для нового интерьерного редактора отдельно подготовлены additive SQL и PostgreSQL-worker. Они ещё не запускались против БД пользователя. Порядок подключения, Cloudflare env и полный список ограничений — [INTERIOR_DESIGN.md](INTERIOR_DESIGN.md). Локальная демонстрация UI без БД/AI: `/playground/interior` в dev, в production возвращает 404.

CI использует Node.js 22 и зависимости из `package-lock.json`. Для запуска нужны development `DATABASE_URL` и `AUTH_SECRET`; локальный fallback AI не заменяет базу и сессии. Не копируйте секреты в Git. `npm ci` и `npm run build` выполняют только `prisma generate`, без изменения схемы БД.

## Схема БД: Prisma Migrate вместо `db push`

В репозитории пока нет `prisma/migrations/`: ниже описан план перехода, а не уже выполненная миграция. `db:deploy` без добавленного baseline не создаст текущую схему на пустой базе. Исправления сессий, квот и refine от 2026-10-08 используют существующие поля и не требуют изменений БД. После их публикации прежние сессии потребуют повторного входа.

`prisma db push` не оставляет истории изменений схемы и годится только для прототипа. Перед новыми таблицами (режим «Дизайн») рабочая база переводится на миграции один раз — «baseline». Все команды запускаются по прямому подключению Neon (строка без `-pooler` в имени хоста, переменная `DATABASE_URL_UNPOOLED`): через пулер Prisma Migrate падает с ошибками вида `prepared statement "s0" already exists`.

Baseline должен описывать **фактически развёрнутую схему**, до новых таблиц дизайна. Сохраните её проверенную Prisma-схему как `prisma/baseline.schema.prisma`; не подставляйте текущий `schema.prisma`, если БД ещё не содержит `design_*`. Иначе `migrate resolve` ошибочно отметит отсутствующие таблицы применёнными. Следующие команды — шаблон для Git Bash, а не выполненная миграция:

1. Убедиться, что рабочая база совпадает с проверенной baseline-схемой (вывод должен быть пустым):
   `npx prisma migrate diff --from-url "$DATABASE_URL_UNPOOLED" --to-schema-datamodel prisma/baseline.schema.prisma --script`
2. Создать стартовую миграцию из текущей схемы:
   `mkdir -p prisma/migrations/0_init`
   `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/baseline.schema.prisma --script > prisma/migrations/0_init/migration.sql`
3. Отметить её применённой в рабочей базе (таблицы не меняются, создаётся служебная `_prisma_migrations`):
   `DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate resolve --applied 0_init`
4. Закоммитить `prisma/migrations/`.

Дальше: изменение схемы — на отдельной ветке Neon (`DATABASE_URL="<прямая строка ветки>" npm run db:migrate -- --name <имя>`), выкатка в рабочую базу — `DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:deploy`. `db:push` остаётся только для локальной временной базы.

3D генерируется напрямую из текста в геометрию; интеграция генерации через изображение и конфигурация Modal удалены. В `/playground/generator` сохранена загрузка готового GLB по ссылке через `src/frontend/glb-import.ts`. Удаление файлов из репозитория не останавливает ранее развёрнутый внешний сервис Modal; это отдельное действие в инфраструктуре.

Для текстового AI настройте серверные `AI_TEXT_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` и при необходимости `CLOUDFLARE_TEXT_MODEL`. Значения Account ID и токена в `.env.example` пустые. `auto` сначала выбирает прежние OPENAI/GROQ/AI-ключи, затем Cloudflare; `cloudflare` выбирает только Workers AI; `disabled` отключает внешнюю генерацию. Ключи не должны иметь префикс `NEXT_PUBLIC_`.

Провайдер использует [официальный OpenAI-compatible endpoint Cloudflare](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) и [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/). Модель по умолчанию — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. В Atrion нет тарифной квоты; ограничения внешних провайдеров независимы. Настройки локальной машины не переносятся в Vercel автоматически.

```powershell
npm ci
npm run test:backend
npx tsc --noEmit
npm run build
npx tsx scripts/gen-report.ts
npx tsx scripts/gen-check.ts
git diff --check
```

`test:backend` запускает проверки текстового провайдера, планировки/проёмов, квоты/отмены, потокового тела, безопасности сессий и OTP, всех путей бесплатной генерации и refine, затем тесты AI-геометрии и `gen-check`. Эта же команда используется в CI. `tsx` закреплён в devDependencies и lock-файле. Сами тесты не вызывают AI и не используют рабочую БД: Prisma и внешние ответы заменены локальными фикстурами. Конкурентные запросы проверяются на границе Prisma; интеграционная проверка на PostgreSQL остаётся отдельной задачей. `gen-report` проверяет процедурный генератор, а не качество реального AI. `gen-check` — регрессионные проверки разбора запроса, процедурных моделей и правил приёма AI-геометрии без вызова AI; при ошибке завершается с ненулевым кодом. Для затронутых CSG или голосового парсера используются `npx tsx scripts/csg-smoke.ts` и `npx tsx scripts/voice-test.ts`.

После `npm run dev` можно проверить отказ без сессии: `POST /api/house/generate` должен вернуть 401. Для успешного вызова нужны настоящая тестовая сессия, доступная квота и провайдер. API принимает `prompt`, возвращает `name`, `document`, `warnings`, `source`. Ошибки: 400 — некорректное описание/тело, 401 — нет входа, 413 — тело больше 1 MiB, 422 — неподдерживаемое задание, 429 — квота/частота, 499 — отмена, 502 — некорректная выдача, 503 — отсутствует настройка AI. Ответ не сохраняется в БД; новая таблица не нужна. Формы дома в основной ветке нет; dev-маршрут `/playground/generator` показывает только процедурный 3D-генератор.

Для 3D проверяйте реальный запрос, геометрию, материалы и экспорт существующего редактора отдельно от сборки. GLB можно импортировать через [Unity glTFast](https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/ImportEditor.html). Проверка файла загрузчиком не доказывает успешную проверку в Unity Editor; skinning, коллайдеры и LOD автоматически не добавляются.
# Проверка общего поля дизайна — обновление 2026-10-08

На `/playground/interior` проверьте «дом» → уточнения о помещениях, этажах и размерах → модель с планами этажей → «Вернуться к комнате». Полное «Одноэтажный дом 12×9 м, три комнаты» должно строиться без повторных вопросов. «Спальня 4×5 м с кроватью и шкафом» → два предмета и размеры 4×5. «абракадабра» должна вызвать уточнение основного объекта, сохранив текущую сцену. `scripts/interior-brief.test.ts`, `scripts/interior-requests.test.ts` и проверки API в `backend-safety.test.ts` входят в `npm run test:backend`. Подробности: [DESIGN_REQUESTS.md](DESIGN_REQUESTS.md).

## Обновление 2026-10-09

`/api/design/preview` и `/api/design/export` требуют сессию и работают без DesignProject/DesignJob. Это основной путь UI в Vercel. Сохранение и история остаются опциональными и требуют схемы из add-interior.sql; при отсутствии таблиц UI предлагает скачать файл. Worker нужен только для очереди прежних API и анализа плана. Применение схемы рабочей БД в этой работе не выполняется.

Список закупки рассчитывает shared/procurement.ts. Для repeat/mirror используется expandPart; мебель комнаты/дома считается целыми каталоговыми предметами, отделка комнаты — площадью за вычетом проёмов. CSV экранирует формулы. Проверки: scripts/interior-procurement.test.ts и backend-safety.test.ts.
