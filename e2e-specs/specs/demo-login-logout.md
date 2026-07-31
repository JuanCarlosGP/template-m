# [demo-login-logout] Login y logout en My Demo App

**Type:** E2E Test Automation
**Status:** Automatizado (Android)
**Date:** 2026-07-21
**Source:** manual (pasos HU pegados por el usuario)
**Test Case:** (desconocido)
**Gherkin:** propuesto

---

## Objetivo

Verificar el flujo feliz de autenticación en Sauce Labs My Demo App: abrir el menú lateral, iniciar sesión con usuario demo, cerrar sesión confirmando el diálogo de alerta, y comprobar que la app redirige a la pantalla de Login.

## Criterios de aceptación (HU / Issue)

1. Se entra en la app `com.saucelabs.mydemoapp.android`.
2. Se abre el panel lateral izquierdo con el botón hamburguesa (superior izquierda).
3. Se pulsa el apartado "Log In".
4. Se establecen credenciales usuario `bod@example.com` y contraseña `10203040`.
5. Se pulsa el botón Login.
6. Se vuelve a abrir el panel lateral con el botón hamburguesa.
7. Se pulsa el apartado "Log Out".
8. En el diálogo de alerta aparece el mensaje "Are you sure you want to logout".
9. Se pulsa "LOGOUT".
10. En la pantalla a la que redirige aparece el texto "Login".

## Reconocimiento del entorno

**Fecha:** 2026-07-21
**Dispositivos:** `192.168.1.45:43493` (Android real) — iOS no disponible (`xcrun` / simulador ausentes)
**Build / appId:** `com.saucelabs.mydemoapp.android` / `com.saucelabs.mydemoapp.ios` (iOS no verificado)

### Estado inicial
- Tras `launchApp` (clearState): catálogo **Products** con hamburguesa `menuIV` (a11y "View menu").

### Pantallas relevantes para la HU
| Pantalla | iOS | Android | Notas |
|----------|-----|---------|-------|
| Products (catálogo) | no verificado | visto — título "Products" | Entrada tras launch / tras login |
| Menú lateral (drawer) | no verificado | visto — Catalog, …, Log In / Log Out | `drawerMenu` / `menuRV` |
| Login | no verificado | visto — título "Login", campos user/pass, botón Login | Tras menú Log In o tras logout |
| Diálogo Log Out | no verificado | visto — mensaje + CANCEL / LOGOUT | Tras menú Log Out estando autenticado |

### Selectores observados (MCP)
- Android hamburguesa: `id:com.saucelabs.mydemoapp.android:id/menuIV` / text a11y "View menu"
- Android menú Log In: `text:'Log In'` (a11y "Login Menu Item")
- Android usuario: `id:…:id/nameET`
- Android contraseña: `id:…:id/passwordET`
- Android botón Login: `id:…:id/loginBtn` / `text:'Login'`
- Android menú Log Out: `text:'Log Out'` (a11y "Logout Menu Item")
- Android diálogo mensaje: `text:'Are you sure you want to logout'` (`android:id/message`)
- Android diálogo confirmar: `text:'LOGOUT'` (`android:id/button1`)
- Android post-logout: `text:'Login'` (`id:…:id/loginTV`)

### Flujos existentes reutilizables
- `OpenApp` — launch con clearState
- `AssertVisibleText` — assert genérico por texto (`TEXT`)

### Riesgos / blockers
- iOS no scouted (sin simulador / xcrun) → automatizar solo Android en este ciclo; iOS diferido.
- `APP_SOURCE_DIR` ausente — selectores solo desde MCP.
- Credenciales demo públicas de Sauce Labs: inyectar vía `USERNAME`/`PASSWORD` (.env / CLI), no hardcodear en YAML trackeados.

## Escenarios (Gherkin)

```gherkin
Feature: Autenticación My Demo App
  Como usuario de My Demo App
  Quiero iniciar y cerrar sesión desde el menú lateral
  Para verificar el ciclo de autenticación demo

  Scenario: Login y logout con usuario demo
    Given abro My Demo App en la pantalla principal
    When abro el menú y pulso "Log In"
    And inicio sesión con usuario "bod@example.com" y contraseña "10203040"
    And abro el menú y pulso "Log Out"
    Then veo el texto "Are you sure you want to logout"
    When confirmo el logout en el diálogo
    Then veo el texto "Login"
```

> Ejecución: `npm run feature -- --feature maestro/features/MyDemoAppAuth.feature --platform android --no-publish`  
> Credenciales demo de Sauce Labs (públicas en la propia pantalla Login); params van a `--env` del flow.

## Plan de automatización

- Feature: `maestro/features/MyDemoAppAuth.feature`
- Step-definitions: `step-definitions/common.json` + `auth.json` (nuevos en auth: LoginWithCredentials, ConfirmLogoutDialog; common: TapMenuItem, OpenApp, AssertVisibleText)
- Flows: `TapMenuItem`, `LoginWithCredentials`, `ConfirmLogoutDialog` (+ `android/`)
- Reutiliza: `OpenApp`, `AssertVisibleText`

## Cobertura por plataforma

- iOS: fuera de alcance en este ciclo (sin device / tooling). Marcar diferido.
- Android: alcance completo — flujo verificado end-to-end en scout.

## Selectores clave

- Menú hamburguesa: `id:com.saucelabs.mydemoapp.android:id/menuIV` — scout
- Ítem menú: `text:'Log In'` / `text:'Log Out'` — scout
- Username: `id:…:id/nameET` — scout
- Password: `id:…:id/passwordET` — scout
- Login button: `id:…:id/loginBtn` — scout
- Diálogo mensaje: `text:'Are you sure you want to logout'` — scout
- Diálogo LOGOUT: `text:'LOGOUT'` — scout
- Título Login: `text:'Login'` / `id:…:id/loginTV` — scout

## Decisiones

- Un solo escenario feliz (login → logout → Login).
- Scope plataforma: **solo Android** hasta tener iOS.
- Credenciales demo en Gherkin (públicas en la app); params → `--env` del flow (no hardcode en YAML).
- Reutilizar `AssertVisibleText` para el mensaje del diálogo y el título "Login".
- Flujo de login tipado en campos (no tap en lista de usernames demo) para reflejar la HU.
- Un solo step `abro el menú y pulso "…"` → `TapMenuItem` (abre hamburguesa + pulsa el ítem).

## Casos límite confirmados

- (ninguno) — no se automatiza locked-out (`alice@example.com`) ni cancelación del diálogo (CANCEL).

## Fuera de alcance

- iOS / My Demo App iOS.
- Cancelar logout (CANCEL).
- Login con usuarios locked-out / visual.
- Persistencia de sesión tras kill de app.

## Riesgos / Notas

- Copy del diálogo sin signo de interrogación: exactamente `Are you sure you want to logout`.
- Tras login el menú muestra "Log Out" en lugar de "Log In" — el escenario asume sesión activa.
- Dispositivo real Wi‑Fi — `ANDROID_SERIAL` debe coincidir con `adb devices` (puerto cambia tras reconnect).
- Assert `Login` puede coincidir con título o botón Login; ambos solo en pantalla Login post-logout → aceptable.

## Sanity (post-ejecución)

**Fecha:** 2026-07-21
**Veredicto:** OK
**Run:** `reports/summary.json` — 1 passed / 0 failed (android); iOS fuera de alcance

### Trazabilidad criterio → test
| Criterio / HU | Paso Gherkin | Flow / aserción | ¿Suficiente? |
|---------------|--------------|-----------------|--------------|
| Entrar en la app | abro My Demo App… | OpenApp (launchApp clearState) | sí |
| Abrir menú e ir a Login | abro el menú y pulso "Log In" | TapMenuItem → menuIV + Log In | sí |
| Credenciales bod@… / 10203040 | inicio sesión con usuario "…" | LoginWithCredentials nameET/passwordET | sí |
| Pulsar Login | (incluido en paso anterior) | tap `loginBtn` | sí |
| Abrir menú e ir a Log Out | abro el menú y pulso "Log Out" | TapMenuItem (2ª vez, params distintos) | sí |
| Mensaje diálogo logout | veo el texto "Are you sure…" | AssertVisibleText | sí |
| Pulsar LOGOUT | confirmo el logout en el diálogo | ConfirmLogoutDialog tap LOGOUT | sí |
| Pantalla redirige con "Login" | veo el texto "Login" | AssertVisibleText | sí — post-logout |

### Huecos detectados
- (ninguno) respecto a la HU; iOS diferido de forma explícita

### Acción
- cerrar — Gate Automatizado (Android); iOS pendiente

## Gate / Resultado

- **Automatizado (Android)** — scenario verde 2026-07-21
- iOS: diferido (sin tooling/simulador en este entorno)
