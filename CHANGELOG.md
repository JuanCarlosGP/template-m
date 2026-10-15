# Changelog

## Unreleased

### Added

- Composite runner: one generated YAML per Gherkin scenario under `maestro/.tmp/scenarios/`. A local run sends every scenario YAML to a single Maestro process. Opt out with `--per-flow` or `MAESTRO_PER_FLOW=1`.
- Failure screenshots copied into `reports/screenshots/`, and visor attribution of which composer `runFlow` failed.
- `npm run compose` writes those scenario YAMLs without a device.
- GitLab CI quality gate for merge requests and the default branch, running `npm ci` and `npm run check` without requiring a device.
- Windows Maestro CLI detection for standard installation paths and the optional `MAESTRO_CLI` override.
- Configurable Azure DevOps request timeout with a 30-second default.
- Unit tests covering the Azure DevOps timeout configuration.

### Changed

- Framework scripts are TypeScript (`maestro/**/*.ts`), run with `tsx`. `npm run check` typechecks with `tsc --noEmit`. Step-definitions stay JSON.
- Retired `maestro/flows/`. Entry YAML lives in `shared/<area>/` (`common`, `auth`, `webview`, `about`). Step-definition `flow` ids use that path (`auth/LoginWithCredentials`).
- Documented adding `C:\maestro\maestro\bin` to `PATH` on Windows (install outside the user profile) and `MAESTRO_CLI` as fallback.
- Updated Maestro installation links to the current CLI documentation.
- Added dual Windows/Unix examples to runner error messages.

### Verification

- `npm run check` passes with 90 tests.
- Framework version is `0.3.4` in `VERSION`, `package.json`, `package-lock.json`, and `README.md`.
