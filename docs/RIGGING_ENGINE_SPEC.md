# ТЗ: 2D Rigging Engine для аниме-персонажей

## 1. Главная цель

Создать систему 2D-риггинга аниме-персонажей, которая позволяет из подготовленного 2D-арта получить живую анимированную модель.

По возможностям и принципу работы система должна быть похожа на Live2D Cubism, но без копирования закрытого кода, форматов и внутренних реализаций Live2D.

Нужен собственный движок и собственный формат проекта.

Основной сценарий:

**арт персонажа → разделение на части → mesh → rig → параметры → физика → анимация → готовая модель**

---

# 2. Входные данные

Поддержать два режима.

## Режим A — Layered Model

Основной и наиболее качественный вариант.

Вход:

- PSD;
- PNG слои;
- отдельные изображения частей персонажа.

Пример структуры:

character/
- body.png
- head.png
- face.png
- hair_back.png
- hair_front.png
- eye_left_white.png
- eye_left_iris.png
- eye_left_lash.png
- eye_right_white.png
- eye_right_iris.png
- eye_right_lash.png
- eyebrow_left.png
- eyebrow_right.png
- mouth_upper.png
- mouth_lower.png
- mouth_inside.png
- nose.png
- neck.png
- arm_left.png
- arm_right.png
- clothes.png

Прозрачность PNG должна сохраняться.

---

## Режим B — Single Image Auto Rig

Пользователь загружает одну картинку персонажа.

Например:

anime_girl.png

Система должна попытаться автоматически определить:

- голову;
- лицо;
- волосы;
- глаза;
- зрачки;
- брови;
- рот;
- шею;
- тело;
- руки;
- одежду.

После определения части должны быть превращены в отдельные логические объекты.

Этот режим может быть менее точным.

Архитектура должна позволять позже подключить отдельную AI-модель сегментации.

---

# 3. Структура модели

Каждая часть персонажа должна существовать как отдельный Drawable.

Пример:

Drawable
{
    id
    name
    texture
    vertices
    uv
    triangles
    opacity
    drawOrder
    parent
    masks
    transform
}

Каждый Drawable должен иметь собственный mesh.

---

# 4. Mesh-система

Реализовать полноценный 2D mesh.

Для каждого слоя:

- vertices;
- UV coordinates;
- triangle indices;
- texture;
- opacity.

Пользователь должен видеть mesh поверх картинки.

Необходимо реализовать:

- добавление вершины;
- удаление вершины;
- перемещение вершины;
- автоматическую генерацию mesh;
- triangulation;
- изменение плотности mesh.

Особенно плотный mesh необходим для:

- лица;
- волос;
- глаз;
- рта;
- груди;
- одежды.

---

# 5. Deformer System

Создать систему деформеров.

Минимально нужны:

## Warp Deformer

Деформирует группу mesh.

Используется для:

- головы;
- лица;
- волос;
- тела;
- одежды.

Пример hierarchy:

Root
└── BodyWarp
    ├── HeadWarp
    │   ├── FaceWarp
    │   ├── HairWarp
    │   ├── EyeLeft
    │   ├── EyeRight
    │   └── Mouth
    └── ClothesWarp

Warp Deformer должен поддерживать:

- translate;
- scale;
- rotation;
- mesh warp.

---

## Rotation Deformer

Используется для вращающихся частей.

Например:

- голова;
- руки;
- хвост;
- аксессуары.

---

# 6. Parameter System

Вся модель должна управляться параметрами.

Создать систему:

Parameter
{
    id
    name
    min
    max
    default
    value
}

Основные параметры:

## Head

ParamAngleX

Диапазон:

-30 → +30

Поворот головы влево/вправо.

ParamAngleY

-30 → +30

Голова вверх/вниз.

ParamAngleZ

-30 → +30

Наклон головы.

---

## Body

ParamBodyAngleX

-10 → +10

ParamBodyAngleY

-10 → +10

ParamBodyAngleZ

-10 → +10

---

# 7. Keyform System

Это одна из самых важных частей.

Каждый параметр должен иметь Keyforms.

Например:

ParamAngleX:

-30
0
+30

Для каждого keyform сохраняется состояние:

- vertex positions;
- deformer positions;
- rotation;
- scale;
- opacity.

При значении между keyforms система должна выполнять interpolation.

Например:

AngleX = 15

автоматически смешивает:

AngleX = 0

и

AngleX = 30.

Interpolation должна работать плавно в реальном времени.

---

# 8. Rig головы

При изменении AngleX голова должна визуально поворачиваться.

Нельзя просто вращать плоскую картинку.

Нужно деформировать:

- форму лица;
- глаза;
- нос;
- рот;
- волосы;
- контур головы.

Например при AngleX = +30:

- дальний глаз становится немного меньше;
- ближний глаз становится немного больше;
- нос смещается;
- рот смещается;
- контур лица изменяется;
- волосы двигаются вместе с головой.

Это должно создавать иллюзию 3D-поворота 2D-персонажа.

---

# 9. Eye Rig

Для каждого глаза создать отдельную систему.

Параметры:

ParamEyeLOpen
ParamEyeROpen

0 → 1

0 = закрыт.

1 = полностью открыт.

Дополнительно:

ParamEyeBallX

-1 → +1

ParamEyeBallY

-1 → +1

Зрачки должны перемещаться внутри глаза.

---

# 10. Blink System

Добавить автоматическое моргание.

Настройки:

blinkInterval
blinkDuration
doubleBlinkChance

Моргание должно выглядеть естественно.

Не использовать строго одинаковый промежуток между морганиями.

---

# 11. Mouth Rig

Параметры:

ParamMouthOpenY

0 → 1

ParamMouthForm

-1 → +1

MouthOpenY управляет открытием рта.

MouthForm:

-1 = грустная форма;
0 = нейтральная;
+1 = улыбка.

Рот должен деформироваться mesh'ем, а не просто масштабироваться.

---

# 12. Lip Sync

Добавить поддержку lip sync.

Источник:

microphoneAudioLevel.

На первой версии достаточно:

audio amplitude → ParamMouthOpenY.

Позже архитектура должна позволять добавить phoneme recognition.

Например:

A
I
U
E
O.

---

# 13. Hair Physics

Волосы должны быть разделены на группы.

Например:

HairFront
HairSideLeft
HairSideRight
HairBack

Каждая группа может иметь несколько physics chains.

Пример:

hairRoot
→ hairMid
→ hairEnd

Использовать spring physics.

Настройки:

stiffness
damping
mass
gravity
wind
maxAngle.

При движении головы волосы должны двигаться с небольшой задержкой.

---

# 14. Clothes Physics

Аналогичную physics-систему использовать для:

- бантиков;
- галстуков;
- рукавов;
- юбок;
- аксессуаров;
- украшений.

---

# 15. Body Breathing

Создать параметр:

ParamBreath

0 → 1

Автоматическая idle-анимация должна слегка изменять:

- грудь;
- плечи;
- тело.

Движение должно быть медленным и едва заметным.

---

# 16. Idle Animation

Даже если пользователь ничего не делает, персонаж должен выглядеть живым.

Idle должен включать:

- дыхание;
- моргание;
- небольшое движение головы;
- небольшое движение тела;
- hair physics;
- небольшое движение глаз.

Не делать движения слишком сильными.

---

# 17. Face Tracking

Архитектура должна поддерживать подключение face tracking.

На вход система должна уметь получать:

headYaw
headPitch
headRoll

eyeLeftOpen
eyeRightOpen

eyeX
eyeY

mouthOpen
smile

И преобразовывать их в параметры модели.

Например:

headYaw → ParamAngleX
headPitch → ParamAngleY
headRoll → ParamAngleZ

mouthOpen → ParamMouthOpenY.

---

# 18. Draw Order

Нужна система слоёв.

Каждый Drawable должен иметь:

drawOrder.

Например:

HairBack = 0
Body = 10
Face = 20
Eyes = 30
Mouth = 35
HairFront = 40

Пользователь должен иметь возможность менять порядок.

---

# 19. Masking

Добавить clipping masks.

Например зрачок должен отображаться только внутри белка глаза.

Drawable должен иметь:

maskIds[].

Поддержать несколько masks.

---

# 20. Editor UI

Сделать полноценный Rig Editor.

Экран разделить примерно так:

лево:

Hierarchy

центр:

Model View

право:

Properties

низ:

Parameters / Timeline.

---

# 21. Hierarchy Panel

Показывать:

Root
Body
Head
Face
Hair
Eyes
Mouth
Clothes

Поддержать drag-and-drop.

---

# 22. Model View

Функции:

- zoom;
- pan;
- select;
- mesh editing;
- transform tool;
- rotate;
- scale;
- warp editing.

Переключатели:

Model
Mesh
Rig
Physics
Animation.

---

# 23. Parameter Panel

Показать sliders.

Например:

Angle X [-30 — 30]

Angle Y [-30 — 30]

Angle Z [-30 — 30]

Eye L [0 — 1]

Eye R [0 — 1]

Mouth [0 — 1].

При движении slider модель должна обновляться сразу.

Цель — стабильные 60 FPS.

---

# 24. Automatic Rig Assistant

Добавить Auto Rig.

После загрузки подготовленных слоёв система пытается автоматически:

1. определить название части;
2. создать hierarchy;
3. создать mesh;
4. создать deformers;
5. создать основные parameters;
6. создать базовые keyforms;
7. настроить blink;
8. настроить eyes;
9. настроить mouth;
10. создать physics.

После Auto Rig пользователь должен иметь возможность всё исправить вручную.

AI не должен скрывать созданный rig.

Пользователь должен видеть и редактировать результат.

---

# 25. Project Format

Не использовать proprietary Live2D .moc3 как основной формат.

Создать собственный формат.

Например:

character.model.json

Пример:

{
  "version": 1,
  "canvas": {},
  "textures": [],
  "drawables": [],
  "meshes": [],
  "deformers": [],
  "parameters": [],
  "keyforms": [],
  "physics": [],
  "animations": []
}

Проект должен сохраняться и повторно открываться без потери rigging-данных.

---

# 26. Rendering

Предпочтительно:

WebGL / WebGPU.

Для MVP можно использовать:

TypeScript
+
React
+
WebGL

или PixiJS, если это действительно упрощает renderer.

Для mesh rendering разрешено использовать WebGL shaders.

Не превращать всё приложение в Canvas 2D, если из-за этого невозможно нормально работать с mesh deformation.

---

# 27. Architecture

Отделить:

/editor
/runtime
/renderer
/model
/mesh
/deformers
/parameters
/physics
/animation
/import
/export
/ai

Editor не должен быть жёстко связан с runtime.

В будущем модель должна запускаться отдельно от редактора.

---

# 28. Runtime Engine

Нужен отдельный runtime.

Пример:

const model = await loadModel("character.model.json");

model.setParameter("ParamAngleX", 20);

model.update(deltaTime);

renderer.render(model);

Runtime должен работать без Editor.

---

# 29. Undo / Redo

Обязательно реализовать:

Ctrl+Z
Ctrl+Y

Для:

- mesh changes;
- parameter changes;
- hierarchy changes;
- deformers;
- keyforms.

---

# 30. Autosave

Добавить autosave.

Не допускать потери всего рига после обновления страницы или ошибки.

---

# 31. Производительность

Цель:

60 FPS для обычной модели.

Приблизительная модель:

30–100 Drawables

5 000–30 000 vertices

20–100 parameters

несколько physics chains.

Не пересчитывать весь rig без необходимости.

Использовать dirty flags/cache там, где это необходимо.

---

# 32. Первый MVP

НЕ пытайся реализовать всё сразу.

Работай маленькими этапами.

## Этап 1

Сделать:

- импорт PNG;
- canvas;
- hierarchy;
- transform слоя;
- save/load проекта.

## Этап 2

Добавить:

- mesh;
- vertex editing;
- triangulation.

## Этап 3

Добавить:

- Warp Deformer;
- Rotation Deformer.

## Этап 4

Parameter System.

Создать:

ParamAngleX

и keyforms:

-30
0
+30.

Добиться плавной интерполяции лица.

## Этап 5

Сделать глаза.

- EyeOpen;
- EyeBallX;
- EyeBallY;
- blink.

## Этап 6

Mouth Rig.

- MouthOpen;
- MouthForm.

## Этап 7

Physics.

Сначала реализовать движение одной пряди волос.

После этого расширить physics engine.

## Этап 8

Head:

AngleX
AngleY
AngleZ.

## Этап 9

Body + breathing + idle.

## Этап 10

Auto Rig Assistant.

---

# 33. Главное требование к качеству

Результатом не должна быть обычная картинка, которая:

- вращается;
- масштабируется;
- двигается целиком.

Нужен настоящий 2D deformation rig.

Например при движении головы должны деформироваться отдельные части изображения.

Персонаж должен визуально ощущаться как Live2D/VTube модель.

---

# 34. Что считать готовым MVP

MVP считается готовым, когда можно:

1. импортировать персонажа по слоям;
2. создать mesh;
3. создать deformers;
4. создать параметры;
5. сделать AngleX/AngleY/AngleZ;
6. моргать;
7. двигать глазами;
8. открывать рот;
9. сделать lip sync;
10. добавить hair physics;
11. добавить breathing;
12. сохранить модель;
13. снова открыть модель;
14. воспроизвести модель через отдельный runtime.

---

# 35. Правила разработки для Astra

Перед каждой задачей:

1. изучи существующий код;
2. найди связанные файлы;
3. не переписывай работающую архитектуру без необходимости;
4. напиши короткий план;
5. делай только одну логическую задачу за раз.

После изменений обязательно:

- typecheck;
- lint;
- tests;
- build.

Не оставлять TypeScript errors.

Не создавать fake/mock реализацию вместо настоящей функции, если задача требует реального поведения.

Если большая функция ещё не реализована — явно помечать её как незавершённую.

Не говорить, что rigging работает, пока он реально не проверен на модели.

---

# 36. Критически важно

Не начинай сразу делать AI-генерацию персонажей.

Сначала должен заработать сам rigging engine.

Приоритет:

mesh
→ deformers
→ parameters
→ keyforms
→ head rig
→ eyes
→ mouth
→ physics
→ runtime
→ Auto Rig AI.

Сначала сделать качественный ручной rigging pipeline.

После этого автоматизировать его при помощи AI.

Итоговая цель:

**загрузить красивого 2D аниме-персонажа → сделать/сгенерировать rig → получить живого персонажа с движением головы, глаз, рта, тела и волос, максимально близкого по ощущению к качественной Live2D-модели.**