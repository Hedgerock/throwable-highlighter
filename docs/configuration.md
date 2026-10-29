# Настройка подсветки

## Расположение настроек

Настройки плагина находятся в разделе:

```text
Settings | Editor | Color Scheme | Throwable Highlighter
```

Раздел содержит пять цветовых ключей:

- `Throwable class`;
- `Throwable import`;
- `Throwable catch`;
- `Throwable throws`;
- `Throwable Javadoc`.

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

## Наследование цвета

По умолчанию `Throwable import`, `Throwable catch`, `Throwable throws`
и `Throwable Javadoc` наследуют цвет от `Throwable class`.

Изменение цвета `Throwable class` применяется к этим контекстам,
пока для соответствующего ключа не задано отдельное значение.

Отдельная настройка ключа влияет только на соответствующий контекст.

Чтобы вернуть наследование, необходимо сбросить явно заданные атрибуты
соответствующего ключа в настройках цветовой схемы.

![Наследование цвета Throwable import](images/throwable-import-inheritance.png)

---

## Ограничения

Настройки применяются только к Java-коду.

Подсветка доступна для типов, которые могут быть разрешены IntelliJ IDEA и являются `Throwable` либо его наследниками.
