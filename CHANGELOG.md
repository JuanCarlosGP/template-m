# Changelog

## Unreleased

### Added

- GitLab CI quality gate for merge requests and the default branch, running `npm ci` and `npm run check` without requiring a device.
- Windows Maestro CLI detection for standard installation paths and the optional `MAESTRO_CLI` override.
- Configurable Azure DevOps request timeout with a 30-second default.
- Unit tests covering the Azure DevOps timeout configuration.

### Changed

- Documented the recommended Windows `PATH` setup and the `MAESTRO_CLI` fallback.
- Updated Maestro installation links to the current CLI documentation.
- Added actionable Windows Maestro paths to setup and runner error messages.

### Verification

- `npm run check` passes with 62 tests.
- Framework version remains `0.3.4`.
