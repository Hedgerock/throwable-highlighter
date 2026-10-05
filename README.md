# Throwable Highlighter

[![Build](https://github.com/Hedgerock/throwable-highlighter/actions/workflows/build.yml/badge.svg)](https://github.com/Hedgerock/throwable-highlighter/actions/workflows/build.yml)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/34660-throwable-highlighter.svg?label=Marketplace)](https://plugins.jetbrains.com/plugin/34660-throwable-highlighter)

Highlights Throwable and Java classes that inherit from it.

## Preview

![Throwable Highlighter preview](docs/images/throwable-highlighting.png)

## Features

- Highlights declarations and references to Throwable and its subclasses.
- Supports custom exception classes and transitive inheritance.
- Highlights the class name in explicit imports of Throwable and its subclasses.
- Does not highlight package names or wildcard imports.
- Provides configurable highlighting through the IDE color scheme.
- Uses the standard Java class color as the default for `Throwable class`.
- Uses the `Throwable class` color as the default for `Throwable import`.

## Configuration

Configure highlighting under:

`Settings | Editor | Color Scheme | Throwable Highlighter`

The color scheme provides two keys:

- `Throwable class` for class declarations and references;
- `Throwable import` for class names in explicit imports.

`Throwable import` inherits the `Throwable class` color until it receives an
explicit color setting.

See the [configuration guide](docs/configuration.md) for details. The guide is
available in Russian.

## Documentation

Project documentation is available in Russian:

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Roadmap](docs/roadmap.md)

## Requirements

- IntelliJ IDEA
- Java support enabled

## Installation

### JetBrains Marketplace

1. Open `Settings | Plugins | Marketplace`.
2. Search for `Throwable Highlighter`.
3. Click `Install`.

You can also install it directly from the
[JetBrains Marketplace](https://plugins.jetbrains.com/plugin/34660-throwable-highlighter).

### Manual installation

1. Download the plugin ZIP from the latest GitHub release.
2. Open `Settings | Plugins`.
3. Click the gear icon and select `Install Plugin from Disk...`.
4. Select the downloaded ZIP.
5. Restart IntelliJ IDEA.

## Development

The project requires JDK 25.

### Run tests

```shell
./gradlew test
```

### Run in the IntelliJ Platform sandbox

```shell
./gradlew runIde
```

### Verify plugin

```shell
./gradlew verifyPlugin
```

### Build plugin

```shell
./gradlew buildPlugin
```

The plugin distribution will be created under:

```text
build/distributions/
```

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
