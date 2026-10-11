# VS Code Prototype

Технический прототип интеграции Throwable Highlighter с VS Code.

## Цель

Проверить возможность выделять стандартные Throwable-типы через Semantic Tokens и сохранить разделение контекстов:

- `throwableClass`;
- `throwableImport`;
- `throwableCatch`.

Прототип не реализует разрешение пользовательских наследников, настройки цветов, публикацию в Marketplace и перенос
IntelliJ-реализации.

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

---

## Проверка

Для первого эксперимента используются стандартные типы:

- `Throwable`;
- `Exception`;
- `RuntimeException`;
- `IOException`;
- `IllegalStateException`;
- `IllegalArgumentException`.

Проверять результат следует через команду `Developer: Inspect Editor Tokens and Scopes`.

---

## Результат Semantic Tokens

Semantic Tokens provider успешно активируется в Extension Development Host.

Стандартная Java-поддержка VS Code сохраняет токен `class` для `RuntimeException`. Пользовательский токен `throwableClass`
не применяется.

Проверка Semantic Tokens завершена с отрицательным результатом.

---

## Следующий шаг

Следующий этап прототипа проверяет editor decorations.

Поддержка VS Code как пользовательской платформы по-прежнему требует отдельного ADR.
