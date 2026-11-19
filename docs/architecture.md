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

Поиск родительских PSI-элементов ограничен границами кода.

Общая ветка ссылок не ищет импорт или Javadoc за пределами ближайшего блока, метода или класса.
Поиск `PsiCatchSection` останавливается на `PsiCodeBlock`, `PsiMethod` или `PsiClass`.
Поиск `PsiMethod` для контекста `THROWS` останавливается на `PsiCodeBlock` или `PsiClass`.

Регрессионные тесты проверяют квалифицированные ссылки в объявлениях и независимость
контекстов внутри локального класса, объявленного в блоке `catch`.

Для `PsiDocTag` аннотатор проверяет имя тега и владельца комментария. Контекст `JAVADOC` применяется к блочным тегам
`@throws` и `@exception` методов и конструкторов.

Java-ссылка извлекается из `PsiDocReferenceHolder` внутри значения тега и разрешается в `PsiClass`. После проверки типа
аннотация создаётся только для имени класса.

Квалификаторы и остальные элементы комментария сохраняют стандартное оформление Javadoc.

Перед проверкой наследования аннотатор запрашивает источник определённого контекста.

При источнике `PLUGIN` аннотатор проверяет принадлежность типа к `Throwable`.
Для CLASS и CATCH выбирается ключ категории, для остальных контекстов — ключ контекста.

### `ThrowableHighlightingContext`

`ThrowableHighlightingContext` определяет стиль подсветки для внутреннего контекста.

Для каждого контекста задаются:

- отображаемое имя
- severity;
- цветовой ключ.

Текущие контексты:

| Контекст | Severity          | Базовый цветовой ключ    |
|----------|-------------------|--------------------------|
| `CLASS`  | `INFORMATION`     | `THROWABLE_CLASS`        |
| `IMPORT` | `TEXT_ATTRIBUTES` | `THROWABLE_IMPORT`       |
| `CATCH`  | `INFORMATION`     | `THROWABLE_CATCH`        |
| `THROWS` | `INFORMATION`     | `THROWABLE_THROWS`       |
| `JAVADOC` | `INFORMATION` | `THROWABLE_JAVADOC`      |

Для `CLASS` и `CATCH` аннотатор выбирает применяемый ключ через категорию типа.
Родительские атрибуты категорий задаются ключами `THROWABLE_CLASS` и `THROWABLE_CATCH` соответственно.

Форма выбора источников и страница цветовой схемы используют отображаемые имена из `ThrowableHighlightingContext`.

Определение PSI-сценария и контекста выполняет `ThrowableAnnotator`.
Для классификации типов в контекстах `CLASS` и `CATCH` использует `ThrowableTypeClassifier`.

### `ThrowableCategory`

Перечисление содержит категории `CHECKED`, `RUNTIME_EXCEPTION` и `ERROR`.
Каждая категория хранит отдельные отображаемые имена и цветовые ключи для `CLASS` и `CATCH`.
Выбор имени и ключа учитывает контекст.

### `ThrowableTypeClassifier`

Компонент определяет категорию разрешённого `PsiClass` через `InheritanceUtil.isInheritor`.
Проверяется принадлежность к `Throwable`, затем к ветвям `RuntimeException` и `Error`.
Остальные типы иерархии относятся к `CHECKED`.

Для обычного класса возвращается `null`.

### `ThrowableHighlighting`

`ThrowableHighlighting` объявляет цветовые ключи плагина:

- `THROWABLE_CLASS` — родительские атрибуты категорий и контекстов;
- `THROWABLE_CHECKED` — checked-типы в `CLASS`;
- `THROWABLE_RUNTIME_EXCEPTION` — `RuntimeException` и его наследники в `CLASS`;
- `THROWABLE_ERROR` — `Error` и его наследники в `CLASS`;
- `THROWABLE_IMPORT` — явные импорты;
- `THROWABLE_CATCH` — родительские атрибуты категорий `CATCH`;
- `THROWABLE_CATCH_CHECKED` — checked-типы в параметрах `catch`;
- `THROWABLE_CATCH_RUNTIME_EXCEPTION` — `RuntimeException` и его наследники в параметрах `catch`;
- `THROWABLE_CATCH_ERROR` — `Error` и его наследники в параметрах `catch`;
- `THROWABLE_THROWS` — типы в списках `throws`;
- `THROWABLE_JAVADOC` — имена классов в Javadoc `@throws` и `@exception`.

`THROWABLE_CLASS` наследует стандартные атрибуты Java-класса.

Ключи категорий `CLASS` и базовые ключи остальных контекстов наследуют атрибуты `THROWABLE_CLASS`.
Ключи категорий `CATCH` наследуют атрибуты `THROWABLE_CATCH`.

### `ThrowableColorSettingsPage`

`ThrowableColorSettingsPage` добавляет раздел `Throwable Highlighter` в настройки цветовой схемы IDE.

Страница предоставляет настройку одиннадцати цветовых ключей и демонстрационный код, содержащий объявления, ссылки, явный импорт,
параметр `catch` и `multi-catch`, список `throws` и Javadoc-теги `@throws` и `@exception`.

Пример показывает отдельные атрибуты checked-типов, наследников `RuntimeException` и `Error`.

### `ThrowableHighlightingSource`

Перечисление задаёт общий источник для каждого контекста подсветки.

- `PLUGIN` применяет ключ категории для `CLASS`, `CATCH` и ключ контекста для остальных элементов.
- `JAVA` использует стандартное оформление IDE.

### `ThrowableHighlightingSettings`

Сервис уровня приложения хранит неизменяемый набор источников. Для каждого контекста по умолчанию используется `PLUGIN`.

Состояние сохраняется в `throwable-highlighter.xml`.
Для совместимости с версией 1.4.0 сервис читает и записывает поле `catchHighlightingSource` через `CatchHighlightingSource`.
При загрузке `THROWABLE_CATCH` преобразуется в `PLUGIN`, а `JAVA` — в `JAVA` общей модели.

`getState()` формирует отдельный объект сериализации из одного снимка настроек.
`updateHighlightingSources()` публикует весь выбранный набор одним обновлением.

### `ThrowableHighlightingSettingsComponent`

Swing-компонент создаёт селект для каждого контекста и хранит выбранные значения как черновик страницы настроек.

### `ThrowableHighlightingSettingsConfigurable`

Компонент загружает сохранённые источники при создании формы и при сбросе черновика.

При применении нового набора `Configurable` сохраняет источники и вызывает `DaemonCodeAnalyzer.restart(reason)`
один раз для каждого открытого проекта. Перезапуск анализа выполняется при изменении набора.

### `plugin.xml`

`plugin.xml` объявляет зависимости от IntelliJ Platform и Java-поддержки.

Файл регистрирует:

- Java-аннотатор `ThrowableAnnotator`;
- страницу настроек цветов `ThrowableColorSettingsPage`;
- страницу выбора источника подсветки `ThrowableHighlightingSettingsConfigurable`.

---

## Поток обработки

```text
PSI-элемент Java
    → определение поддерживаемого PSI-сценария
    → получение класса, контекста и диапазона
    → проверка необходимости аннотации для выбранного источника
    → проверка типа Throwable и определение категории для CLASS и CATCH
    → выбор цветового ключа
    → аннотация с severity контекста
    → отображение по текущей цветовой схеме
```

---

## Ограничения

Плагин обрабатывает только Java-код.

Плагин не выполняет статический анализ исключений и не заменяет встроенные инспекции IntelliJ IDEA.

Отдельная подсветка плагина не применяется к ключевому слову `throw`, именам Javadoc-тегов, описаниям исключений, другим
Javadoc-тегам и inline-ссылкам. Эти элементы сохраняют стандартное оформление IDE.
