# Changelog

All notable changes to this project are documented in this file.

The project follows Semantic Versioning.

## [Unreleased]

### Documentation

- Added project documentation for architecture, configuration, roadmap, and
  documentation language rules.
- Updated the README and plugin description to document import highlighting.
- Clarified that highlighting applies to `Throwable` and its subclasses.

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

[Unreleased]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Hedgerock/throwable-highlighter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Hedgerock/throwable-highlighter/releases/tag/v1.0.0
