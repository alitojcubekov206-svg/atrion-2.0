# Экспорт в Unity

В Design Engine скачайте GLB (цвета и геометрия) либо OBJ (геометрия). В «Дизайне» GLB включает комнаты и мебель; экспорт дома всегда содержит дом целиком, даже когда просмотр открыт на отдельном этаже. Все координаты — метры.

Для GLB в Unity: откройте Package Manager → Install package by name, установите com.unity.cloud.gltfast, перенесите скачанный файл в Assets и перетащите импортированный объект в сцену. Проверьте масштаб, материалы и при необходимости добавьте коллайдеры. Коллайдеры, риг и анимации не создаются этим экспортом.

[Официальная установка glTFast](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/index.md), [импорт GLB в Editor](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/ImportEditor.md), [поддерживаемые форматы Unity](https://docs.unity.com/en-us/engine/6000.6/manual/assets-and-media/asset-types/models/creating-dccassets/3d-formats).

Файлы GLB проверяются локальным загрузчиком геометрии; Unity Editor на этой машине отсутствует, поэтому импорт внутри Unity не проверен.

## Закупка

Разверните «Что закупать» и скачайте CSV. Количество повторённых и зеркальных деталей соответствует текущей геометрии. Мебель дома/комнаты считается целыми предметами, а не ножками и треугольниками. Список модели — предварительная ведомость: она не рассчитывает несущие конструкции, крепёж, марки материалов, запас, труд и рыночные цены.
