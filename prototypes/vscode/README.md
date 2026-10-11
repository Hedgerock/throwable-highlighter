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

Прототип определяет целевые типы по известному имени и не использует разрешение Java-символов. Его поведение пока не является
полным соответствием контракту Java-подсветки.

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
npm run compile
```

3. Запустить конфигурацию `Run Throwable Highlighter Prototype` клавишей F5.
4. В открытом Extension Development Host открыть Java-файл.

После изменения TypeScript-кода необходимо повторно выполнить `npm run compile` и перезапустить Extension Development Host.

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

Отсутствие результата Definition Provider не считается ошибкой. Будущий resolver не должен подтверждать тип Throwable,
если поставщик определений не вернул доступное определение.

Проверка подтверждает, что Definition Provider может использоваться как основа для определения пользовательских Java-типов.

---

## Следующий шаг

Следующий этап реализует минимальную проверку прямого наследования пользовательского Java-типа через Definition Provider.

Этап не включает рекурсивную проверку транзитивного наследования, кэширование результатов и изменение текущей логики editor
decorations.

Поддержка VS Code как пользовательской платформы по-прежнему требует отдельного ADR.
