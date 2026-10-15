# Changelog

## Unreleased

### Added

- GitLab CI quality gate for merge requests and the default branch, running `npm ci` and `npm run check` without requiring a device.
- Windows Maestro CLI detection for standard installation paths and the optional `MAESTRO_CLI` override.
- Configurable Azure DevOps request timeout with a 30-second default.
- Unit tests covering the Azure DevOps timeout configuration.

### Changed

- Documented adding `C:\maestro\maestro\bin` to `PATH` on Windows (install outside the user profile) and `MAESTRO_CLI` as fallback.
- Updated Maestro installation links to the current CLI documentation.
- Added dual Windows/Unix examples to runner error messages.

### Verification

- `npm run check` passes with 62 tests.
- Framework version is `0.3.4` in `VERSION`, `package.json`, `package-lock.json`, and `README.md`.
