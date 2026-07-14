# [manual-expand-bank] Login en 12 EXPAND BANK (Appium Practice)

**Type:** E2E Test Automation
**Status:** Done
**Date:** 2026-07-09
**Source:** manual (simulación HU — sin Git/Azure)
**Test Case:** (manual)
**Gherkin:** verbatim

---

## Objetivo

Verificar que un usuario puede abrir Appium Practice, entrar en **12 EXPAND BANK**, iniciar sesión con credenciales válidas y ver la sesión iniciada (texto **Logout**).

## Criterios de aceptación (HU / Issue)

1. Al abrir la app, la pantalla principal muestra el texto **The Practice App**.
2. El usuario puede entrar en el apartado **12 EXPAND BANK**.
3. Puede escribir `practice` en usuario y contraseña y pulsar **Login**.
4. Tras login correcto se muestra el texto **Logout**.

## Reconocimiento del entorno

**Fecha:** 2026-07-09
**Dispositivos:** Nothing A063 (Android 15), Wi‑Fi `192.168.1.45:43295`
**Build / appId:** `com.expandtesting.practice`

### Pantallas relevantes

| Pantalla | Android | Notas |
|----------|---------|-------|
| Inicio | `The Practice App` visible | `launchApp` + `clearState` para estado limpio |
| Login Expand Bank | `Username` / `Password` EditText; botón `LOGIN` | Tras tap en `12 EXPAND BANK` |
| Home banco | `LOGOUT` botón | Sesión iniciada |

### Selectores observados (MCP)

- Usuario: `id:com.expandtesting.practice:id/usernameTextField`
- Contraseña: `id:com.expandtesting.practice:id/passwordTextField`
- Login: `id:com.expandtesting.practice:id/loginButton` (texto `LOGIN`)
- Logout: texto `Logout` (botón `LOGOUT` en jerarquía)

### Riesgos / blockers

- Sesión previa: usar `clearState: true` en `launchApp`.
- App solo Android en Play Store — escenario `@android`.

## Escenarios (Gherkin)

```gherkin
# language: es
@android
Feature: Appium Practice - Expand Bank

  Scenario: Login en 12 EXPAND BANK con credenciales válidas
    Given abro Appium Practice en la pantalla principal
    Then veo el texto "The Practice App"
    When entro en "12 EXPAND BANK" e inicio sesión con usuario "practice" y clave "practice"
    Then veo el texto "Logout"
```

## Plan de automatización

- Feature: `maestro/features/AppiumPracticeExpandBank.feature`
- Step-definitions: `step-definitions/appium-practice.json`
- Flows: `ExpandBankOpenApp`, `AssertVisibleText`, `ExpandBankLoginForm` (+ `android/`)
- Reutiliza: `AssertVisibleText` (genérico por `${TEXT}`)

## Cobertura por plataforma

- iOS: (fuera de alcance — app no disponible en template demo)
- Android: flujo completo en dispositivo real

## Selectores clave

- Login usuario: `id:com.expandtesting.practice:id/usernameTextField`
- Login contraseña: `id:com.expandtesting.practice:id/passwordTextField`
- Botón login: `id:com.expandtesting.practice:id/loginButton`

## Decisiones

- `clearState` en apertura para HU reproducible.
- Texto `Logout` en Gherkin; Maestro matchea `LOGOUT` (IGNORE_CASE).

## Casos límite confirmados

- (ninguno) en este escenario feliz

## Fuera de alcance

- MAKE PAYMENT, MORTGAGE, EXPENSE REPORT
- Logout y re-login

## Riesgos / Notas

- Depende de dispositivo Android conectado por Wi‑Fi ADB.

## Sanity (post-ejecución)

- **2026-07-09:** `npm run feature:expand-bank-login` → **PASS** (Nothing A063, `192.168.1.45:43295`).
- `npm run validate` y `npm run check` → OK.
- Antes del run: `adb connect 192.168.1.45:43295` si Maestro no ve el serial IP.

## Gate / Resultado

- **PASS** — escenario feliz cubre los 4 criterios de la HU en Android.
