# Архитектура плагина

## Назначение

Throwable Highlighter выделяет в Java-коде Throwable и его наследников.

Плагин поддерживает отдельную подсветку для:

- объявлений классов;
- ссылок на классы;
- явных импортов классов;
- типов `Throwable` и его наследников в параметрах `catch`;
- типов `Throwable` и его наследников в списках `throws` методов и конструкторов;
- имён классов Throwable в Javadoc `@throws` и `@exception` методов и конструкторов.

---

## Компоненты

### `ThrowableAnnotator`

`ThrowableAnnotator` реализует интерфейс `Annotator` и обрабатывает PSI-элементы Java.

Компонент обрабатывает четыре PSI-сценария:

- `PsiClass` — объявление класса;
- `PsiJavaCodeReferenceElement` — ссылка на класс;
- `PsiImportStatement` — явный импорт класса;
- `PsiDocTag` — Javadoc-тег.

Для ссылок и явных импортов аннотатор разрешает элемент в `PsiClass`.
Объявление класса уже представлено `PsiClass`. После этого аннотатор проверяет, является ли класс `Throwable` либо его
наследником.

Проверка выполняется через `InheritanceUtil.isInheritor`. Транзитивное наследование поддерживается стандартным механизмом
IntelliJ Platform.

Импорты с символом `*` не подсвечиваются. Для явного импорта подсвечивается только имя импортируемого класса, без имени
пакета.

Ссылки внутри `PsiImportStatement` и `PsiDocComment` не обрабатываются общей веткой ссылок `CLASS`.
Импорты и целевые Javadoc-теги обрабатываются отдельно.

Для обычных ссылок аннотатор определяет контекст подсветки. Если `PsiJavaCodeReferenceElement` находится в `PsiTypeElement`
параметра `PsiCatchSection`, используется контекст `CATCH`. Если ссылка находится в списке, возвращаемом `PsiMethod.getThrowsList()`,
используется контекст `THROWS`. Во всех остальных случаях используется контекст `CLASS`.

Проверка принадлежности к `PsiTypeElement` исключает применение контекста `CATCH` к ссылкам внутри тела блока `catch`.

`PsiMethod` представляет методы и конструкторы. Проверка `PsiMethod.getThrowsList()` ограничивает контекст `THROWS` ссылками
на типы в секции `throws` и не затрагивает ссылки внутри тела метода или конструктора.

Для `PsiDocTag` аннотатор проверяет имя тега и владельца комментария. Контекст `JAVADOC` применяется к блочным тегам
`@throws` и `@exception` методов и конструкторов.

Java-ссылка извлекается из `PsiDocReferenceHolder` внутри значения тега и разрешается в `PsiClass`. После проверки типа
аннотация создаётся только для имени класса.

Квалификаторы и остальные элементы комментария сохраняют стандартное оформление Javadoc.

### `ThrowableHighlightingContext`

`ThrowableHighlightingContext` определяет стиль подсветки для внутреннего контекста.

Для каждого контекста задаются:

- severity;
- цветовой ключ.

Текущие контексты:

| Контекст | Severity          | Цветовой ключ      |
|----------|-------------------|--------------------|
| `CLASS`  | `INFORMATION`     | `THROWABLE_CLASS`  |
| `IMPORT` | `TEXT_ATTRIBUTES` | `THROWABLE_IMPORT` |
| `CATCH`  | `INFORMATION`     | `THROWABLE_CATCH`  |
| `THROWS` | `INFORMATION`     | `THROWABLE_THROWS` |
| `JAVADOC` | `INFORMATION` | `THROWABLE_JAVADOC` |

Контекст не определяет тип PSI-элемента и не проверяет отношение типа к `Throwable`. Эти задачи остаются в
`ThrowableAnnotator`.

### `ThrowableHighlighting`

`ThrowableHighlighting` объявляет цветовые ключи плагина:

- `THROWABLE_CLASS` — основной ключ для классов и ссылок;
- `THROWABLE_IMPORT` — ключ для явных импортов;
- `THROWABLE_CATCH` — ключ для типов в параметрах `catch`;
- `THROWABLE_THROWS` — ключ для типов в списках `throws`;
- `THROWABLE_JAVADOC` — ключ для имён классов в Javadoc `@throws` и `@exception`.

`THROWABLE_CLASS` наследует стандартный цвет Java-класса.

`THROWABLE_IMPORT`, `THROWABLE_CATCH`, `THROWABLE_THROWS` и `THROWABLE_JAVADOC` наследуют цвет от
`THROWABLE_CLASS`. Изменение `THROWABLE_CLASS` применяется к этим контекстам, пока для соответствующего ключа не задан
отдельный цвет.

### `ThrowableColorSettingsPage`

`ThrowableColorSettingsPage` добавляет раздел `Throwable Highlighter` в настройки цветовой схемы IDE.

Страница предоставляет настройку пяти цветовых ключей и демонстрационный код, содержащий объявления, ссылки, явный импорт,
параметр `catch`, список `throws` и Javadoc-теги `@throws` и `@exception`.

### `plugin.xml`

`plugin.xml` объявляет зависимости от IntelliJ Platform и Java-поддержки.

Файл регистрирует:

- Java-аннотатор `ThrowableAnnotator`;
- страницу настроек цветов `ThrowableColorSettingsPage`.

---

## Поток обработки

```text
PSI-элемент Java
    → определение контекста
    → разрешение ссылки в PsiClass
    → проверка типа Throwable или наследования от него
    → выбор ThrowableHighlightingContext
    → severity и цветовой ключ контекста
    → отображение с настройками текущей цветовой схемы
```

---

## Ограничения

Плагин обрабатывает только Java-код.

Плагин не выполняет статический анализ исключений и не заменяет встроенные инспекции IntelliJ IDEA.

Отдельная подсветка плагина не применяется к ключевому слову `throw`, именам Javadoc-тегов, описаниям исключений, другим
Javadoc-тегам и inline-ссылкам. Эти элементы сохраняют стандартное оформление IDE.
