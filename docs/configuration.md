# Настройка подсветки

## Расположение настроек

Настройки плагина находятся в разделе:

```text
Settings | Editor | Color Scheme | Throwable Highlighter
```

Раздел содержит четыре цветовых ключа:

- `Throwable class`;
- `Throwable import`;
- `Throwable catch`;
- `Throwable throws`.

### `Throwable class`

Ключ `Throwable class` соответствует `THROWABLE_CLASS`.

`THROWABLE_CLASS` применяется к объявлениям и ссылкам на `Throwable` и его наследников.

По умолчанию ключ наследует стандартный цвет Java-класса из активной цветовой схемы IDE.

![Настройка цвета Throwable class](images/throwable-class-color.png)

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

Он применяется к `Throwable` и его наследникам в параметре `catch`.

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

---

## Наследование цвета

По умолчанию `Throwable import`, `Throwable catch` и `Throwable throws` наследуют цвет от `Throwable class`.

Изменение цвета `Throwable class` применяется к импортам, типам в `catch` и типам в `throws`, если для соответствующего ключа
не задано отдельное значение.

Отдельная настройка `Throwable import` влияет только на явные импорты `Throwable` и его наследников.

Отдельная настройка `Throwable catch` влияет только на типы `Throwable` и его наследников в параметрах `catch`.

Отдельная настройка `Throwable throws` влияет только на типы `Throwable` и его наследников в списках `throws`.

Чтобы вернуть наследование, необходимо сбросить явно заданные атрибуты для `Throwable import`, `Throwable catch` или
`Throwable throws` в настройках цветовой схемы.

![Наследование цвета Throwable import](images/throwable-import-inheritance.png)

---

## Ограничения

Настройки применяются только к Java-коду.

Подсветка доступна для типов, которые могут быть разрешены IntelliJ IDEA и являются `Throwable` либо его наследниками.
