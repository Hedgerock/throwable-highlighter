# Throwable Highlighter

Throwable Highlighter is an IntelliJ IDEA plugin that highlights Java classes
inheriting from `Throwable`.

## Preview

![Throwable Highlighter preview](docs/images/throwable-highlighting.png)

## Features

- Highlights `Throwable` and its subclasses.
- Supports custom exception classes.
- Supports transitive inheritance.
- Highlights both declarations and references.
- Works in fields, local variables, `new`, `throws`, `catch`, and `extends`.
- Provides configurable highlighting through the IDE color scheme.
- Uses the standard Java class highlighting as a fallback.

## Configuration

The highlighting style can be configured under:

`Settings | Editor | Color Scheme | Throwable Highlighter`

## Requirements

- IntelliJ IDEA
- Java support enabled

## Installation

### From JetBrains Marketplace

Coming soon.

### From disk

1. Download the plugin ZIP.
2. Open `Settings | Plugins`.
3. Select `Install Plugin from Disk...`.
4. Select the downloaded ZIP.
5. Restart IntelliJ IDEA.

## Development

### Build

```shell
./gradlew buildPlugin
```

### Run in the IntelliJ Platform sandbox

```shell
./gradlew runIde
```

### Run tests

```shell
./gradlew test
```

### Verify plugin

```shell
./gradlew verifyPlugin
```

## License

Licensed under the Apache License 2.0.