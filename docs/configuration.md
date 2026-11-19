# Настройка подсветки

## Расположение настроек

Атрибуты подсветки настраиваются в разделе:

```text
Settings | Editor | Color Scheme | Throwable Highlighter
```

Раздел содержит восемь цветовых ключей:

- `Throwable class`;
- `Throwable checked`;
- `Throwable runtime exception`;
- `Throwable error`;
- `Throwable import`;
- `Throwable catch`;
- `Throwable throws`;
- `Throwable Javadoc`.

### `Throwable class`

Ключ `Throwable class` соответствует `THROWABLE_CLASS`.

`THROWABLE_CLASS` задаёт родительские атрибуты категорий типов и остальных контекстов подсветки.

По умолчанию ключ наследует стандартный цвет Java-класса из активной цветовой схемы IDE.

![Настройка цвета Throwable class](images/throwable-class-color.png)

### Категории типов

Объявления и ссылки контекста `CLASS` используют цветовой ключ категории разрешённого Java-класса.

| Настройка                     | Цветовой ключ                 | Типы                                                                 |
|-------------------------------|-------------------------------|----------------------------------------------------------------------|
| `Throwable checked`           | `THROWABLE_CHECKED`           | `Throwable` и его наследники вне ветвей `RuntimeException` и `Error` |
| `Throwable runtime exception` | `THROWABLE_RUNTIME_EXCEPTION` | `RuntimeException` и его наследники                                  |
| `Throwable error`             | `THROWABLE_ERROR`             | `Error` и его наследники                                             |

Все три ключа по умолчанию наследуют атрибуты `THROWABLE_CLASS`.

Собственные атрибуты категории применяются к объявлениям и ссылкам контекста `CLASS`.
При выборе `Java highlighting` для `CLASS` используется стандартное оформление IDE.

### `Throwable import`

Ключ `Throwable import` соответствует `THROWABLE_IMPORT`.

Он применяется к имени класса в явном импорте.

```java
import java.io.IOException;
               ^^^^^^^^^^^
```

Имя пакета в импорте не подсвечивается.

Импорты с символом `*` не подсвечиваются.

### `Throwable catch`

Ключ `Throwable catch` соответствует `THROWABLE_CATCH`.

При источнике `Throwable catch` ключ применяется к `Throwable` и его наследникам в параметре `catch`.

```java
catch (IOException exception) {
        ^^^^^^^^^^^
}
```

![Наследование цвета Throwable catch](images/throwable-catch-inheritance.png)

### `Throwable throws`

Ключ `Throwable throws` соответствует `THROWABLE_THROWS`.

Он применяется к `Throwable` и его наследникам в списке `throws` метода или конструктора.

```java
import java.io.IOException;

void execute() throws IOException {
                      ^^^^^^^^^^^
}
```

### `Throwable Javadoc`

Ключ `Throwable Javadoc` соответствует `THROWABLE_JAVADOC`.

Он применяется к имени класса `Throwable` или его наследника в блочных
Javadoc-тегах `@throws` и `@exception` методов и конструкторов.

```java
/**
 * @throws java.io.IOException if execution fails
 */
void execute() throws java.io.IOException {
}
```

В квалифицированной ссылке подсвечивается только имя класса.
Имя пакета, квалификаторы, имя тега и описание исключения сохраняют
стандартное оформление Javadoc.

Оба тега используют одну настройку. Другие Javadoc-теги и inline-ссылки
сохраняют стандартную подсветку IDE.

Неразрешённые ссылки и типы, не относящиеся к Throwable, не подсвечиваются.

---

## Источники подсветки

Источник каждого контекста выбирается отдельно в `Settings | Tools | Throwable Highlighter`.

- Вариант с именем контекста, например `Throwable throws`, использует атрибуты плагина.
  Для `CLASS` применяется ключ категории типа.
- `Java highlighting` использует стандартное оформление IDE для элементов этого контекста.

По умолчанию все контексты используют источник плагина. При обновлении с версии 1.4.0
загружается ранее сохранённый выбор для `CATCH`.

Выбор применяется ко всем проектам IDE и сохраняется между запусками.
`Apply` и `OK` применяют настройки к открытым редакторам. `Cancel` отменяет неприменённые изменения.

Атрибуты хранятся в цветовой схеме отдельно от источников.
Предпросмотр цветовой схемы показывает атрибуты плагина для всех контекстов.

Например, для `Throwable class` можно выбрать `Java highlighting`, а для `Throwable throws`
оставить источник плагина. Тогда обычные ссылки на классы получают стандартное оформление IDE,
а типы в `throws` используют атрибуты `THROWABLE_THROWS`. Если для этого ключа включено наследование,
цвет берётся из `THROWABLE_CLASS`.

---

## Наследование цвета

По умолчанию ключи категорий `Throwable checked`, `Throwable runtime exception` и `Throwable error`,
а также контексты `Throwable import`, `Throwable catch`, `Throwable throws` и `Throwable Javadoc`
наследуют атрибуты `Throwable class`.

Изменение атрибутов `Throwable class` применяется ко всем наследующим ключам,
пока для соответствующего атрибута сохраняется наследование.

Собственные атрибуты категории применяются в контексте `CLASS`.
Остальные контексты используют свои ключи и наследуют атрибуты непосредственно от `THROWABLE_CLASS`.

Чтобы вернуть наследование, необходимо сбросить явно заданные атрибуты
соответствующего ключа в настройках цветовой схемы.

![Наследование цвета Throwable import](images/throwable-import-inheritance.png)

---

## Ограничения

Настройки применяются только к Java-коду.

Подсветка доступна для типов, которые могут быть разрешены IntelliJ IDEA и являются `Throwable` либо его наследниками.
