# ADR-0036: Организовать расширения по платформам

## Статус

Принято.

---

## Контекст

Throwable Highlighter публикуется для IntelliJ Platform и VS Code.
[ADR-0035](0035-independent-platform-releases.md) определяет независимые процессы выпуска.

Расширение VS Code размещено в `extensions/vscode`. Исходники, тесты и конфигурация сборки IntelliJ Platform размещены в
корне репозитория. Общие скрипты локальных проверок находятся в `scripts/`.

---

## Решение

Платформенные проекты размещаются в `extensions/intellij` и `extensions/vscode`. Каждый проект хранит свои исходники,
тесты, конфигурацию сборки и версию. История изменений IntelliJ-плагина хранится в `extensions/intellij/CHANGELOG.md`.

IntelliJ-плагин собирается как самостоятельный Gradle-проект. Gradle Wrapper хранится в корне репозитория. При запуске из
корня каталог проекта указывается через `-p extensions/intellij`. Расширение VS Code собирается через npm из `extensions/vscode`.

Общие скрипты CI и локальных проверок вместе с их тестами хранятся в `.ci/`. Workflows GitHub Actions хранятся в
`.github/workflows/`, точки входа локальных Git hooks — в `.githooks/`. Общая спецификация, Java fixtures и документация
проекта хранятся в `docs/`.

Для будущих выпусков IntelliJ Platform используется тег `intellij-v<major>.<minor>.<patch>`. Это уточняет формат
тега IntelliJ Platform из ADR-0035. Выпуски VS Code используют `vscode-v<major>.<minor>.<patch>`. Опубликованные теги IntelliJ
Platform сохраняют исходные имена.

---

## Последствия

CI, локальные проверки и документация используют пути платформенных проектов. Каждый релизный workflow запускается по
тегам своей платформы.

---

## Не входит в решение

- Выделение общего исполняемого ядра расширений.
- Изменение пользовательских настроек и идентификаторов расширений.

---

## Связанные решения

- [ADR-0004: Платформенное развитие Throwable Highlighter](0004-platform-expansion.md)
- [ADR-0035: Разделить процессы выпуска IntelliJ Platform и VS Code](0035-independent-platform-releases.md)
