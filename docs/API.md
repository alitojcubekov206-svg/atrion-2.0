# HTTP API

Контракты текущего кода, база `main` / `26ea85d`. Все тела JSON, кроме запросов без тела. Ошибки обычно `{ error, code? }`; `code` есть не у каждого ответа. Пути `{id}` и `{token}` соответствуют динамическим Next.js-папкам.

Риггинг и модель дома получили отдельные приватные маршруты. Контракты, ответы, лимиты и примеры — [DESIGN_BACKEND.md](DESIGN_BACKEND.md). Фронтенд пока не вызывает их.

## Авторизация

| Метод / путь | Вход | Успешный ответ / действие |
| --- | --- | --- |
| POST `/api/auth/register` | `name, email, password` | `{ok, devCode?}`, сессия; код при включённой проверке email |
| POST `/api/auth/login` | `email, password` | `{ok}`, сессия |
| POST `/api/auth/logout` | — | Удаление session-cookie |
| POST `/api/auth/verify` | `code` + сессия | `{ok}`, emailVerified |
| POST `/api/auth/resend-verification` | `email?` + сессия | `{ok, email?, devCode?}`; неподтверждённый аккаунт может исправить email |
| POST `/api/auth/forgot-password` | `email` | `{ok, devCode?}`; нейтральный ответ для неизвестного email |
| POST `/api/auth/reset-password` | `email, code, password` | `{ok}`, новый пароль и сессия |
| PATCH `/api/auth/account` | `currentPassword, newPassword` + сессия | `{ok}`, смена пароля |
| DELETE `/api/auth/account` | `password` + сессия | `{ok}`, удаление User и проектов |

Rate limiting auth — в [rate-limit.ts](../src/backend/rate-limit.ts), значения — в самих [маршрутах](../src/app/api/auth). Коды имеют срок 10 минут. Существующие session JWT на других устройствах при смене/сбросе пароля не отзываются глобально.

## Проекты

Требуют `requireApiUser`, проверку email при включённом флаге и владение конкретным проектом.

| Метод / путь | Вход | Успешный ответ |
| --- | --- | --- |
| GET `/api/projects` | — | `{projects}` со своими проектами, updatedAt по убыванию |
| POST `/api/projects` | `idea` (10–2000 символов) | `{project}` со статусом draft |
| GET `/api/projects/{id}` | — | `{project}`; interview/blueprint — JSON-строки или null |
| DELETE `/api/projects/{id}` | — | `{ok}` |
| POST `/api/projects/{id}/interview` | — | `{questions}`; сохранение interview |
| POST `/api/projects/{id}/generate` | `answers?: Record<string,string>` | `{blueprint}`; сохранение generated, ответ ограничен 500 символами на поле |
| POST `/api/projects/{id}/expert` | `role, question, history?` | `{reply}`; вопрос 2–1500 символов, последние 6 валидных сообщений |
| POST `/api/projects/{id}/starter` | — | `{kit}`; список файлов, summary, nextSteps |
| POST `/api/projects/{id}/share` | — | `{url, expiresInDays:30}` |

Для expert/starter/share нужен сохранённый blueprint. GET `/share/{token}` — публичная страница, а не JSON API. Невалидный/просроченный токен и удалённый проект дают 404.

## 3D

| Метод / путь | Вход | Успешный ответ |
| --- | --- | --- |
| POST `/api/3d/interview` | `prompt` 10–1500 символов | `{questions}` |
| POST `/api/3d/generate` | `prompt` 10–1500 символов, `answers?` | `{concept, diagnostics}` |
| POST `/api/3d/refine` | `concept, instruction, selectedPartId?` | `{concept}`; инструкция 3–1000 символов |
| POST `/api/3d/chat` | `message, prompt?, concept?` | Ответ chat-функции, без обёртки reply |
| GET `/api/3d/providers` | Сессия | `{aiConfigured}`; конфигурация, не health check |

3D interview/generate/refine/chat используют `requireApiUser` и суточную AI-квоту. Free-лимит за всё время расходуется только на generate. Успешный demo/fallback считается выполнением. `refine` принимает клиентскую сцену, её проверка не является полной валидацией всех полей `ThreeDConcept`.

## Ошибки и время

401 — нет сессии; 403 / `EMAIL_NOT_VERIFIED` — требуется email; 403 / `LIMIT_REACHED` — проекты; 403 / `THREE_D_LIMIT_REACHED` — генерации; 429 / `AI_LIMIT_REACHED` — AI за UTC-день; 429 / `RATE_LIMITED` с `Retry-After` — auth limiter. Также встречаются 400 (вход), 404 (проект), 409 (конфликт/повреждённый blueprint), 502 (генерация), 503 (почта не настроена).

Текстовые AI route handlers задают `maxDuration=60`; фактический предел исполнения зависит от хостинга. Общий browser helper по умолчанию прерывает ожидание через 45 секунд; вызовы генерации могут переопределять timeout. Прерывание браузером не гарантирует отмену серверной работы и возврат квоты. Image API имеет отдельные лимиты, описанные ниже.

## Запросы персонажей

`POST /api/3d/generate` и `/api/3d/interview` после auth/проверки ввода отклоняют явные 2D/Live2D/VTuber-запросы с 400 `CHARACTER_GENERATION_UNAVAILABLE`, до резервирования квот. Это объясняет отсутствие автоматического рига; генерация рисунка и ручной редактор доступны отдельно. Поддержка 3D-примитивов сохраняется.

`GET /api/characters/concept` возвращает `{configured,provider,imageMime,stage:"concept",rigReady:false}`. `provider` — cloudflare/openai; configured означает наличие настроек, а не проверенный внешний доступ. Ключ и Account ID не выдаются. `POST` принимает `{prompt}` (10–1500 символов), требует сессии, проверяет provider, резервирует AI-квоту и возвращает `{stage:"concept",rigReady:false,image:{mime:"image/jpeg" | "image/webp",base64}}`. Нет сохранения в БД, автоматического рига или demo fallback. Ошибки: 400 — описание, 429 — квота, 503 — нет настроек либо провайдер отклонил доступ, 429 IMAGE_PROVIDER_LIMIT_REACHED — лимит Cloudflare, 422 — moderation, 502 — ошибка/некорректный ответ, 504 — timeout, 499 — отмена. Ответы private/no-store. Детали тайм-аутов и подключения — [CHARACTER_GENERATION.md](CHARACTER_GENERATION.md).
