---
name: atrion-3d-rigging
description: "Проектировать, реализовывать и проверять 3D-риггинг Atrion: кости, привязки деталей, позы и экспорт. Применять к ригам 3D-моделей этого проекта, а не к плоским персонажам или планировке дома."
---

# 3D-риггинг Atrion

Работай в подтверждённом репозитории `alitojcubekov206-svg/atrion-2.0`; читай его `AGENTS.md` и [RIGGING_3D.md](../../../docs/RIGGING_3D.md). Текущая ветка содержит Design Engine и ручной rigid-редактор `/dashboard/rigging`. Не считай незакоммиченный rig-файл в другой копии реализованной функцией текущей ветки и не переноси его автоматически.

## Объём рига

Установи, нужны ли жёсткие детали или деформируемая поверхность. Примитивный `ThreeDConcept` пригоден для rigid bindings; skinned mesh требует weights, skeleton и отдельного экспортного контракта. Для механического/жёсткого рига FK можно выполнить без провайдера AI. Текущий этап разрешает интерфейс 2D/3D-риггинга; проверяй [DESIGN_BACKEND.md](../../../docs/DESIGN_BACKEND.md).

## Контракт

Прочитай `src/shared/types.ts`, `geometry.ts`, `ConceptViewer` и `export-3d.ts` в этой ветке. Сохраняй полный bbox в `size`, XYZ-радианы, единицы, local mesh vertices и разворачивание repeat/mirror.

Раздели bind pose, текущий pose и derived geometry. Bone graph валидируется на циклы/ссылки; binding имеет постоянный локальный offset. Изменение parent должно корректно переносить потомков. Явно реши, привязаны ли все instances или материализованные отдельные IDs. Нормализуй quaternion; не меняй размеры детали вместо её rotation.

CAD edits, CSG/delete, exploded view и риг должны иметь совместимую семантику. При удалении bound-part обнови ссылки и undo атомарно. Не запекай декоративную сборку в bind pose. Автоматические назначения по name/role показывай как исправляемые подсказки.

## Проверка и результат

Проверь аналитическую parent/child трансформацию, reset bind pose, reparent, repeat/mirror, mesh transform и отсутствие double-application. Проверь undo/redo, JSON round trip и сопоставление visible pose со статическим экспортом.

Существующий GLB exporter не доказывает поддержку skeleton/animation. Для заявления о skinned export открой результат в целевом importer и проверь bones, weights и clip. Если результата нет, обозначь экспорт запечённой геометрии. Предложенные контракты/пути отделяй от реально созданных; общие проверки кода определены в корневом AGENTS.
