# Changelog

All notable changes to this project are documented in this file.

The project follows Semantic Versioning.

## [Unreleased]

## [1.4.0] - 2026-10-30

### Added

- Configurable highlighting for Throwable class names in Javadoc `@throws` and `@exception` tags on methods and constructors.
- The `Throwable Javadoc` color key, which inherits the `Throwable class` color by default.
- A catch highlighting source selector with `Throwable catch` and `Java highlighting` options.
- Application-wide source settings under `Settings | Tools | Throwable Highlighter`.

### Changed

- Reduced unnecessary PSI ancestor traversal when determining highlighting contexts.

## [1.3.0] - 2026-10-15

### Added

- Configurable highlighting for Throwable types in `throws` clauses.
- The `Throwable throws` color key, which inherits the `Throwable class` color by default.

### Documentation

- Documented the `throws` highlighting context and its configuration.

## [1.2.0] - 2026-10-09

### Added

- Configurable highlighting for Throwable types in `catch` clauses.
- The `Throwable catch` color key, which inherits the `Throwable class` color by default.

### Documentation

- Added project documentation for architecture, configuration, roadmap,
  documentation language rules, and architectural decisions.
- Updated the README and plugin description to document import and catch highlighting.
- Clarified that highlighting applies to `Throwable` and its subclasses.

### Fixed

- Color settings preview preserves standard Java syntax highlighting for non-Throwable code.

## [1.1.0] - 2026-10-05

### Added

- Configurable highlighting for explicit imports of `Throwable` and its subclasses.
- The `Throwable import` color key.

### Changed

- Import highlighting applies only to the imported class name.
- `Throwable import` inherits the `Throwable class` color by default.

## [1.0.0] - 2026-09-30

### Added

- Initial release of Throwable Highlighter.
- Highlighting for declarations and references to `Throwable` and its subclasses.
- Support for custom exception classes and transitive inheritance.
- Configurable highlighting through the IntelliJ IDEA color scheme.

[Unreleased]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Hedgerock/throwable-highlighter/releases/tag/v1.0.0
