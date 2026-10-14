# VS Code Prototype

Технический прототип интеграции Throwable Highlighter с VS Code.

## Назначение

Прототип проверяет возможность реализовать контракт Java-подсветки Throwable в VS Code без изменения стандартной Java-подсветки.

Первый этап проверил Semantic Tokens. Подход не позволил добавить собственные токены поверх используемой Java-поддержки.

Текущий этап проверяет editor decorations.

Прототип не является поддерживаемым пользовательским расширением.

## Поддерживаемые сценарии

Прототип выделяет известные стандартные типы:

- `Throwable`;
- `Exception`;
- `RuntimeException`;
- `IOException`;
- `IllegalArgumentException`;
- `IllegalStateException`.

Список является ограниченным fallback-набором и не описывает полную иерархию Throwable в JDK. Остальные типы могут быть
определены через Definition Provider.

Текущая реализация editor decorations определяет известные стандартные типы Throwable без обращения к Definition Provider.

Пользовательский класс подсвечивается, если `JavaTypeDefinitionResolver` подтверждает его прямое или транзитивное наследование
от известного типа Throwable.

Подсветка пользовательского типа применяется в контекстах `CLASS`, `IMPORT` и `CATCH`.

Транзитивный обход ограничен шестнадцатью переходами по иерархии классов. Недоступное определение, цикл или
превышение глубины сохраняют стандартную Java-подсветку.

Прототип не выполняет полное семантическое разрешение Java-кода и не является полным соответствием контракту Java-подсветки.

Подсветка различает контексты:

- `CLASS` — объявление и обычная ссылка на тип;
- `IMPORT` — тип в явном импорте;
- `CATCH` — тип в параметре `catch`.

Комментарии, строковые литералы, символьные литералы и text blocks не участвуют в поиске типов.

---

## Запуск

1. Открыть папку как отдельную рабочую область VS Code.
2. Выполнить:
    
```powershell
npm install
npm run check
```

3. Запустить конфигурацию `Run Throwable Highlighter Prototype` клавишей F5.
4. В открытом Extension Development Host открыть Java-файл.

После изменения TypeScript-кода необходимо повторно выполнить `npm run check` и перезапустить Extension Development Host.

---

## Автоматическая проверка

`npm run check` собирает прототип и выполняет автоматические проверки.

`npm run test:hierarchy` отдельно проверяет `ThrowableHierarchyResolver` без запуска Extension Development Host и
Definition Provider.

Тесты покрывают fallback-типы, прямое и транзитивное наследование, отсутствие родителя, ограничение глубины, циклы и
состояние `unavailable`.

---

## Настройка цветов

Прототип предоставляет следующие настройки:

| Настройка                                    | Назначение                      | Значение по умолчанию        |
|----------------------------------------------|---------------------------------|------------------------------|
| `throwableHighlighter.prototype.classColor`  | Цвет типов в контексте `CLASS`  | Стандартный цвет Java-класса |
| `throwableHighlighter.prototype.importColor` | Цвет типов в контексте `IMPORT` | Наследует `classColor`       |
| `throwableHighlighter.prototype.catchColor`  | Цвет типов в контексте `CATCH`  | Наследует `classColor`       |

Пустое значение цвета не создаёт foreground-decoration и сохраняет стандартный цвет Java-класса.

Настройки можно изменить через Settings или в Workspace Settings JSON:

```json
{
  "throwableHighlighter.prototype.classColor": "#4EC9B0",
  "throwableHighlighter.prototype.importColor": "#CE9178",
  "throwableHighlighter.prototype.catchColor": "#C586C0"
}
```

## Проверка

Для проверки используются fixtures из контракта Java-подсветки:

- `import-context.java` — типы в явных импортах используют `IMPORT`;
- `catch-context.java` — тип параметра `catch` использует `CATCH`, ссылка внутри тела блока использует `CLASS`;
- `multi-catch-context.java` — каждый тип использует `CATCH`;
- `syntax-preservation.java` — комментарии, модификаторы, ключевые слова и нецелевые элементы сохраняют стандартную
  Java-подсветку.
- `cross-file` — пользовательский прямой наследник в отдельном Java-файле использует контексты `CLASS`, `IMPORT` и `CATCH`;
- `transitive` — пользовательский транзитивный наследник требует последовательного определения `NestedException` и `BaseException`.

После очистки всех трёх настроек целевые типы должны вернуться к стандартному цвету Java-класса.

---

## Результат Semantic Tokens

Semantic Tokens provider успешно активируется в Extension Development Host.

Стандартная Java-поддержка VS Code сохраняет токен `class` для `RuntimeException`. Пользовательский токен `throwableClass` не
применяется.

Проверка Semantic Tokens завершена с отрицательным результатом.

---

## Результат editor decorations

Editor decorations применяются поверх стандартной Java-подсветки и не заменяют её.

Прототип различает контексты `CLASS`, `IMPORT` и `CATCH`, поддерживает отдельные настройки цветов и наследование цветов от
`CLASS`.

Проверка editor decorations завершена успешно.

---

## Результат проверки Definition Provider

Прототип предоставляет команду `Throwable Highlighter Prototype: Inspect Definition`.

Команда вызывает документированную команду VS Code `vscode.executeDefinitionProvider` для символа под курсором и выводит
результат в Output Channel `Throwable Highlighter Prototype`.

Проверка подтвердила следующие сценарии:

- пользовательский `CustomException` разрешается в Java-файл рабочей области;
- `Throwable` разрешается в открываемый Java-документ виртуальной схемы `jdt://`;
- `RuntimeException` может не вернуть определение.

Отсутствие результата Definition Provider не считается ошибкой.

Если Definition Provider не возвращает допустимое определение, resolver не может подтвердить пользовательский тип, объявленный вне
текущего документа.

Известные стандартные типы Throwable определяются отдельно и не зависят от ответа Definition Provider.

Проверка подтверждает, что Definition Provider может использоваться как основа для определения пользовательских Java-типов.

---

## Результат проверки JavaTypeDefinitionResolver

`JavaTypeDefinitionResolver` определяет принадлежность Java-символа к иерархии Throwable.

Известные стандартные типы Throwable определяются без вызова Definition Provider.

Для пользовательского типа resolver получает определение через `vscode.executeDefinitionProvider` и рекурсивно проверяет
цепочку прямых родителей до известного типа Throwable или подтверждённого нецелевого типа.

Проверка через команду `Throwable Highlighter Prototype: Inspect Definition` подтвердила следующие результаты:

- `CustomException` определяется как тип Throwable;
- `ClassContextFixture` не определяется как тип Throwable;
- `RuntimeException` определяется как тип Throwable независимо от ответа Definition Provider.

Resolver подключён к editor decorations.

Decoration controller применяет подсветку пользовательского типа только после положительного результата resolver. Результат
игнорируется, если документ изменился или controller был удалён во время асинхронной проверки.

---

## Результат проверки кэширования определения типов

Resolver кэширует в памяти Extension Host подтверждённые результаты межфайлового определения пользовательских типов.

Повторное открытие Java-файла с уже определённым пользовательским наследником использует сохранённый результат и не требует
нового вызова Definition Provider.

Кэш очищается после изменения документов и файлов рабочей области. Временное отсутствие результата Definition Provider не
сохраняется и может быть проверено повторно после готовности Java-поддержки.

---

## Результат проверки транзитивного наследования

Fixture `transitive` подтверждает определение `NestedException`, который транзитивно наследует `RuntimeException` через
`BaseException`.

`NestedException` использует контексты `CLASS`, `IMPORT` и `CATCH`.

Изменение прямого родителя `BaseException` с `RuntimeException` на нецелевой тип снимает подсветку `NestedException`.
Возврат наследования от `RuntimeException` восстанавливает подсветку после инвалидирования кэша.

---

## Архитектура определения типов

`JavaTypeDefinitionResolver` является фасадом VS Code-интеграции. Он сохраняет публичный API для decoration controller и
Definition Probe, обращается к Definition Provider и владеет кэшем результатов.

`JavaClassDeclarationReader` выделяет ссылку на тип, разбирает заголовок Java-класса и определяет его прямого родителя.
Для исключения комментариев, строковых литералов, символьных литералов и text blocks он использует `JavaCodeMask`.

`ThrowableHierarchyResolver` не зависит от VS Code API. Он обходит цепочку прямых родителей, ограничивает глубину, предотвращает
циклы и возвращает состояние `confirmed` либо `unavailable`.

Разделение реализовано согласно [ADR-0008](../../docs/decisions/0008-separate-vscode-hierarchy-resolution.md).
