# Серверная часть риггинга и дома

Хранение реализовано в `src/backend/design`, чистые контракты/evaluators ригов — в `src/shared/rigging`, клиент — в `src/frontend/rigging`. Все маршруты используют `requireApiUser`, включая проверку email при включённом флаге. Вычисления детерминированные, без внешнего AI; суточная AI-квота и старый счётчик 3D-генераций не расходуются.

## API

| Метод | Путь | Тело / результат |
| --- | --- | --- |
| POST | `/api/design/evaluate` | `{document, options?}` → `{kind, result}`; без сохранения |
| GET | `/api/design-documents` | `?kind=rig2d\|rig3d\|house&limit=20&offset=0` → `{documents, limit, offset}`; метаданные своих документов |
| POST | `/api/design-documents` | `{name, document}` → 201 `{document: metadata}` |
| GET | `/api/design-documents/[id]` | `{document: saved}` с JSON в `saved.data` |
| PATCH | `/api/design-documents/[id]` | `{name, document, revision}` → `{document: metadata}`; полная замена, тип неизменяемый |
| DELETE | `/api/design-documents/[id]` | `{revision}` → `{ok:true}` |
| POST | `/api/design-documents/[id]/evaluate` | Объект options, например `{clipId:"wave",time:0.5}` → `{kind, revision, result}` |
| GET | `/api/design-documents/[id]/export` | JSON-файл `{name, document}`; можно передать обратно в POST создания |

`metadata` содержит `id`, `name`, `kind`, `revision`, `createdAt`, `updatedAt`; первая revision — 1. Чтение также возвращает `userId` и `data`. Чужой/несуществующий документ — 404. PATCH/DELETE с устаревшей revision — 409 `REVISION_CONFLICT`: загрузить актуальный документ и повторно согласовать изменения. Общей истории ревизий нет.

Технические границы: тело до 1 MiB, включая поток без Content-Length; name до 120 символов; 100 документов на пользователя; список limit 1–50, offset 0–100. Rate limit — 60 запросов в минуту на пользователя для всех новых маршрутов вместе, в памяти одного экземпляра, отключён в development. Ошибки содержат `{error, code}`: 400 — некорректный документ/запрос, 401/403 — доступ, 413 — объём, 429 — частота, 503 `DATABASE_SCHEMA_NOT_READY` — новая таблица/колонка ещё отсутствует. Неизвестные поля удаляются при нормализации документа.

## 2D

`Rig2DDocument`: `kind:"rig2d"`, `schemaVersion:1`, `canvas:{width,height}`, `assets`, `layers`, `bones`, `attachments`, `clips`, optional `pose`. Размеры — пиксели; +x вправо, +y вверх; rotation — радианы. Матрица `[a,b,c,d,tx,ty]` преобразует точку в `[a*x+c*y+tx, b*x+d*y+ty]`. Canvas переводит +y вверх в экранные координаты.

Transform: `{position:[x,y],rotation,scale:[sx,sy]}`. Scale положительный 0.01–100; affine-матрица сохраняет shear от неравномерного масштаба предков. Bone: `{id,parentId:null|id,length,bind:transform}`; кость направлена по локальной +x. Родитель задаёт локальное пространство потомка; порядок в массиве произвольный, циклы запрещены.

Asset: `{id,uri,mime,width,height}`. URI — HTTPS без credentials либо data URI PNG/WebP до 256 KiB декодированных байт. Сервер проверяет MIME и сигнатуру inline PNG/RIFF WebP, но не декодирует изображения; HTTPS не скачивает. Клиент декодирует локальные файлы до добавления. Отдельного object storage нет. Layer: `{id,assetId,zIndex,visible,pivot:[x,y],transform}`. Pivot задан в локальных координатах изображения. Attachment: `{layerId,boneId,offset:transform}`; привязанный слой использует `boneWorld * offset`, непривязанный — `layer.transform`; затем вычитается pivot. При привязке `layer.transform` не складывается с offset.

Clip: `{id,duration,loop,tracks}`. Track: `{boneId,rotationMode:"shortest"|"unwrapped",keys}`. Key: `{time,transform,interpolation:"linear"|"step"}`; время в секундах строго возрастает и находится в пределах duration. Интерполяция задаётся начальным ключом сегмента; shortest вращает по кратчайшему пути, unwrapped сохраняет полные обороты. Loop использует modulo, без loop время ограничивается концом клипа; за крайними ключами сохраняется ближайший ключ. Options: `{clipId?,time?,pose?}`; pose — карта полных локальных transforms и перекрывает клип. Bind данные не меняются. Без clip/options.pose используется optional document.pose; при выборе клипа document.pose не перекрывает его. Явный pose:{} возвращает bind pose без клипа.

Layer допускает optional `skin:{vertices,uv?,triangles,weights}`. `vertices` — `[x,y]` в пикселях ассета, +y вверх; `triangles` — тройки индексов; `weights` — массив на каждую вершину с 1–4 `{boneId,weight}`. Веса положительные, сумма 1 с допуском 1e-6, повторные и неизвестные кости запрещены. Сетка не сочетается с attachment. Не более 4096 вершин и 8192 треугольников на слой; суммарно 8192/16384 на документ. Опциональный uv хранит отдельную пару текстурных координат на каждую вершину; при его отсутствии используется vertices для совместимости. UV и vertices находятся в пределах ассета; вырожденные треугольники геометрии и UV отклоняются. Редактирование геометрии материализует UV и больше их не перемещает. Предыдущие сборки, не поддерживающие отдельные UV, не должны открывать изменённые сетки: они потеряют привязку текстуры.

Evaluator вычисляет вершину как сумму `weight * poseBoneWorld * inverse(bindBoneWorld) * layerRestMatrix * vertex`, где layerRestMatrix учитывает pivot. В результате слоя `skin` содержит исходные `uv`, `triangles` и мировые `vertices`; `matrix` сохраняется для совместимости жёсткого пути, повторно к skin-вершинам не применяется. JSON-хранилище и экспорт сохраняют skin через общий parser. Старые документы без skin продолжают работать; старые версии приложения, не знающие skin, для таких документов не подходят.

Максимумы: canvas 16384², asset 8192², по 256 assets/layers/bones/attachments, 32 clips, 512 keys на track и 8192 keys суммарно. Минимум одна кость. Пример скелета без изображений:

```json
{
  "name": "Двухкостный скелет",
  "document": {
    "kind": "rig2d", "schemaVersion": 1,
    "canvas": {"width": 400, "height": 400},
    "assets": [], "layers": [], "attachments": [],
    "bones": [
      {"id":"root","parentId":null,"length":100,"bind":{"position":[0,0],"rotation":0,"scale":[1,1]}},
      {"id":"arm","parentId":"root","length":100,"bind":{"position":[100,0],"rotation":0,"scale":[1,1]}}
    ],
    "clips": []
  }
}
```

Для `/api/design/evaluate` передать `document` из примера и `options:{pose:{root:{position:[0,0],rotation:1.5707963267948966,scale:[1,1]}}}`. Head/tail второй кости будут около `[0,100]`/`[0,200]`. Этот пример вычисляет скелет, но не изображение персонажа.

## 3D

`Rig3DDocument`: `kind:"rig3d"`, `schemaVersion:1`, `units:"m"|"cm"|"mm"`, `bones`, `parts`, `bindings`, optional `pose`. Bone содержит `id`, `parentId`, `length`, `bind:{position:[x,y,z],rotation:[rx,ry,rz]}`; направлен по локальной +y. Вращения XYZ в радианах, масштаба костей нет. Part использует существующий `ModelPart`: полные size до вращения, world position/rotation исходной bind pose; shape/color/name/id обязательны. Material по умолчанию «Не задан», quantity нормализуется из repeat/mirror. Binding: `{partId,boneId}`; вся часть со всеми экземплярами привязывается к одной кости.

Options: `{pose:{boneId:{position,rotation}}}`. Каждая часть сначала разворачивается через существующий `expandPart`, затем получает `poseBoneWorld * inverse(bindBoneWorld) * partBindWorld`. Возвращаются world position/rotation, matrix (Three.js column-major), size, `sourcePartId` и IDs экземпляров. Локальные mesh-вершины не переписываются; трансформация применяется один раз. Максимум 128 bones, 256 parts/bindings, 4096 экземпляров; mesh содержит до 90000 чисел position полных треугольников, опциональный normal той же длины.

Это жёсткие привязки, без skinning/weights, IK и 3D animation clips. JSON-экспорт сохраняет исходный риг и optional document.pose; options запроса не записываются сами. Редактор сохраняет pose явно. GLB в UI — запечённая видимая статическая поза, без скелета/анимаций.

## Дом

`HouseDocument`: `kind:"house"`, `schemaVersion:1`, `units:"m"`, width/depth 3–100, wallThickness 0.05–0.6, floorHeight 2.2–6, wallColor `#RRGGBB`, roof flat/gable, floors (1–3). Floor: `{id,rooms,openings}`. Room: `{id,name,x,z,width,depth}` — прямоугольник в номинальном плане от северо-западного угла; x вправо, z к югу, y вверх. Комнаты внутри габарита, не пересекаются; минимум 1×1 м. Это номинальные размеры, а не чистая площадь за вычетом стен.

Opening: `{id,roomId,side:"north"|"south"|"east"|"west",kind:"door"|"window",offset,width,bottom,height}`. На north/south offset вдоль +x; на east/west — вдоль +z. Требуются отступы wallThickness от концов комнаты и 0.1 м над проёмом. Door начинается от пола, пересекающиеся проёмы отвергаются. Максимум 32 rooms и 128 openings на этаж.

Вычисление строит общие стены соседних комнат однократно, режет реальные пустые проёмы, создаёт перекрытия толщиной 0.2 м и крышу. 3D центрируется относительно габарита дома, внешние стены остаются внутри него. Результат содержит parts, floors с elevation/rooms и предупреждения. Общий cap — 12000 деталей. Rooms/openings остаются в исходном документе; wall parts сгруппированы по этажу, отдельного room/wall mapping для интерактивного выбора пока нет.

Нет лестниц, стекла, дверных полотен, мебели и инженерных сетей. Дом является концептуальным эскизом; многоквартирные/строительные нормы, несущие расчёты, BIM и пригодность к строительству не подтверждаются.

## Хранилище и выпуск

`DesignDocument` содержит userId, kind, name, JSON data, revision и timestamps. User удаляется вместе с документами. Создание в транзакции блокирует строку User перед подсчётом лимита; PATCH использует атомарный фильтр id/userId/revision. Данные нормализуются до записи и проверяются после чтения.

DDL — [prisma/design-documents.sql](../prisma/design-documents.sql), схема — [schema.prisma](../prisma/schema.prisma). SQL подготовлен для ревью/отдельной staging-базы и не исполнялся на production. Это не история Prisma migrations. Перед включением хранения нужно проверить схему и CRUD на выделенной базе; `prisma generate` только обновляет клиент. Отсутствие таблицы не препятствует вычислению через `/api/design/evaluate`, но авторизация всё равно требует существующей базы User.

Проверки: `npm run test:backend`, `npx tsc --noEmit`, `npm run build`. Unit-тесты хранения используют подменённый Prisma-клиент и проверяют ограничения запросов; они не доказывают блокировки/гонки в PostgreSQL. UI подключён; выполненные проверки и ограничения перечислены в [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Деформеры 2D

Rig2DDocument версии 1 допускает optional `deformers`, слой с skin — optional `deformerId`. Старые документы без этих полей работают как раньше. Старые сборки без поддержки deformers не должны пересохранять новые документы: они отбросят неизвестные поля.

Общие поля деформера: `id`, `parentId`, `kind: rotation|warp`, `pivot:[x,y]`, `position:[x,y]`, `rotation` в радианах, `scale:[x,y]`. Поворот и масштаб выполняются вокруг pivot, затем position. Warp дополнительно хранит `origin`, `size`, `columns`, `rows`, `points`. Points — управляющие точки по строкам от нижнего левого угла, в исходных координатах модели (+y вверх).

Порядок вычислений: вершина ассета → layerRestMatrix с pivot → назначенный деформер → его предки → bone skinning. Все деформеры одной цепи описаны в общем исходном пространстве модели; parent не добавляет вторую локальную систему координат. Warp использует билинейную интерполяцию смещений. За границей клетки продолжается граничное смещение без прижимания вершин к краю. UV не меняются. Один деформер может управлять несколькими слоями.

Ограничения: 128 деформеров, до 16×16 клеток одного Warp, всего до 8192 управляющих точек; родители существуют, циклы/повторные ID запрещены, scale 0.01–100. Ячейки должны быть выпуклыми с положительной ориентацией. Это не гарантирует отсутствия любых пересечений итоговой модели при произвольных цепях/весах. Слои без mesh не принимают deformerId.

Деформеры управляются также параметрическими keyforms и временными треками параметров. Костные клипы продолжают работать поверх деформированной формы.

## Parameters и keyforms 2D

Опциональное `parameters` содержит до 64 элементов `{id,name,min,max,default,value,deformerId,keyforms}`. Для одного деформера допустим один параметр; независимые движения комбинируются иерархией. `min < max`, default/current входят в диапазон; default обязательно имеет ключевую форму.

`keyforms` — 1–32 формы с уникальными возрастающими `value`. Форма хранит `position`, `rotation` (радианы), `scale`, а для Warp — `points` исходной топологии. Между соседними формами применяется линейная интерполяция; за крайними формами — ближайшая. Угол интерполируется как заданное число без кратчайшей дуги/wrap. Pivot, origin, размер/топология сетки принадлежат исходному деформеру. Бюджет — 32768 управляющих точек всех форм. Выпуклость/ориентация клеток проверяется и на промежуточных значениях; это не гарантия отсутствия любых пересечений после всей цепи и skinning.

Клип может содержать `parameterTracks:[{parameterId,keys:[{time,value,interpolation}]}]`. До 64 треков, 512 ключей на трек и 4096 ключей параметров на клип; общий бюджет документа 8192 ключа учитывает костные и параметрические треки. Время возрастает, входит в длительность; значения входят в диапазон. `linear|step`, loop и clamp согласованы с костными клипами.

`evaluateRig2D` и `/api/design/evaluate` принимают `options.parameterValues:{parameterId:number}`. Явные значения перекрывают клип; неизвестный ID/значение вне диапазона отклоняются. Результат с параметрами содержит вычисленное `parameterValues`. Старые документы без parameters сохраняют прежний результат. Прямые формы вершин и opacity, многомерные таблицы параметров пока не поддержаны.

Клип 2D допускает опциональное `name` (непустая строка до 80 символов). Оно переносится JSON/parser и не меняет ID, ключи или вычисление анимации. Старые документы без name поддерживаются.
