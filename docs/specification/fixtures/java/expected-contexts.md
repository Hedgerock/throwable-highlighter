# Ожидаемые контексты Java fixtures

Документ определяет ожидаемую подсветку для Java fixtures.

Количество обозначает число вхождений идентификатора в указанном контексте.

Диагностика Java-компилятора в fixtures с неразрешёнными или некорректными типами не относится к подсветке `Throwable`.

---

## Межфайловый сценарий

`cross-file` содержит пользовательский тип в отдельном Java-файле.

| Идентификатор       | Контекст | Количество |
|---------------------|----------|------------|
| `ExternalException` | `CLASS`  | 3          |
| `ExternalException` | `IMPORT` | 1          |
| `ExternalException` | `CATCH`  | 1          |
| `RuntimeException`  | `CLASS`  | 1          |

`ExternalException` объявлен в отдельном файле и напрямую наследует `RuntimeException`.

Для ссылок на `ExternalException` в файле `CrossFileContextFixture.java` prototype должен получить определение типа через
Definition Provider.

---

## Транзитивный межфайловый сценарий

`transitive` содержит пользовательскую цепочку наследования в отдельных Java-файлах.

| Идентификатор      | Контекст | Количество |
|--------------------|----------|------------|
| `BaseException`    | `CLASS`  | 2          |
| `NestedException`  | `CLASS`  | 3          |
| `NestedException`  | `IMPORT` | 1          |
| `NestedException`  | `CATCH`  | 1          |
| `RuntimeException` | `CLASS`  | 1          |

`BaseException` напрямую наследует `RuntimeException`.

`NestedException` напрямую наследует `BaseException` и транзитивно наследует `RuntimeException`.

Для ссылок на `NestedException` prototype должен последовательно получить определение `NestedException` и `BaseException`
через Definition Provider.

---

## `class-context.java`

| Идентификатор      | Контекст | Количество |
|--------------------|----------|------------|
| `RuntimeException` | `CLASS`  | 1          |
| `CustomException`  | `CLASS`  | 5          |
| `Throwable`        | `CLASS`  | 1          |

---

## `throws-context.java`

| Идентификатор              | Контекст | Количество |
|----------------------------|----------|------------|
| `IOException`              | `IMPORT` | 1          |
| `IOException`              | `THROWS` | 2          |
| `IOException`              | `CLASS`  | 1          |
| `IllegalArgumentException` | `THROWS` | 1          |

Контекст `THROWS` применяется к типам в списках `throws` методов и конструкторов.

Каждый тип в списке `throws` подсвечивается отдельно.

Ссылка на `IOException` внутри тела метода использует контекст `CLASS`.

---

## `import-context.java`

| Идентификатор | Контекст | Количество |
|---------------|----------|------------|
| `Throwable`   | `IMPORT` | 1          |
| `IOException` | `IMPORT` | 1          |

Wildcard import не подсвечивается.

Имя пакета в явном импорте не подсвечивается.

---

## `catch-context.java`

| Идентификатор      | Контекст | Количество |
|--------------------|----------|------------|
| `RuntimeException` | `CATCH`  | 1          |
| `RuntimeException` | `CLASS`  | 1          |

Контекст `CATCH` применяется к типу параметра `catch`.

Контекст `CLASS` применяется к ссылке внутри тела `catch`.

---

## `multi-catch-context.java`

| Идентификатор              | Контекст | Количество |
|----------------------------|----------|------------|
| `IllegalArgumentException` | `CATCH`  | 1          |
| `IllegalStateException`    | `CATCH`  | 1          |

Каждый тип в multi-catch подсвечивается отдельно.

---

## `excluded-contexts.java`

`String`, `List` и другие типы, не являющиеся `Throwable` или его наследниками, не подсвечиваются.

Неразрешённый тип не подсвечивается.

Не-`Throwable` тип в параметре `catch` не использует контекст `CATCH`.

Не-`Throwable` тип в списке `throws` не использует контекст `THROWS`.

---

## `syntax-preservation.java`

Только типы `Throwable` и его наследников используют контексты подсветки.

| Идентификатор | Контекст | Количество |
|---------------|----------|------------|
| `IOException` | `IMPORT` | 1          |
| `IOException` | `CLASS`  | 2          |
| `IOException` | `THROWS` | 1          |

Модификаторы, ключевые слова, комментарии, имена переменных и параметры сохраняют стандартный стиль Java активной темы
или цветовой схемы.
