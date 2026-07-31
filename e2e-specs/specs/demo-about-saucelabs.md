# [demo-about-saucelabs] About abre el sitio Sauce Labs en navegador

**Type:** E2E Test Automation
**Status:** Automatizado (Android)
**Date:** 2026-07-21
**Source:** manual (pasos HU pegados por el usuario)
**Test Case:** (desconocido)
**Gherkin:** propuesto

---

## Objetivo

Verificar que desde About se puede abrir el enlace a Sauce Labs en el navegador externo y que la landing muestra el headline de marketing esperado.

## Criterios de aceptación (HU / Issue)

1. Se entra en la app `com.saucelabs.mydemoapp.android`.
2. Se abre el panel lateral con el botón hamburguesa.
3. Se pulsa el apartado "About".
4. Se pulsa el texto "Go to the Sauce Labs website." (redirige a navegador externo).
5. Se verifica que aparece el texto "Verify AI-generated code at the pace it's written.".

## Reconocimiento del entorno

**Fecha:** 2026-07-21
**Dispositivos:** `adb-P3127C003079-nts6YM._adb-tls-connect._tcp` (Android real) — `192.168.1.45:40903` falló al launch en scout; mismo físico vía otro transporte
**Build / appId:** `com.saucelabs.mydemoapp.android` → Chrome `com.android.chrome`

### Estado inicial
- Tras launch + menú → **About** (versión `V.2.2.0-build 25`).

### Pantallas relevantes para la HU
| Pantalla | iOS | Android | Notas |
|----------|-----|---------|-------|
| About | no verificado | visto — título About, link Sauce Labs | nativo |
| Sauce Labs (Chrome) | no verificado | visto — `saucelabs.com` + headline | navegador externo |

### Selectores observados (MCP)
- Menú: `id:…:id/menuIV`
- Ítem: `text:'About'`
- Link: `id:…:id/webTV` / `text:'Go to the Sauce Labs website.'` (a11y "Tap to view content of given url")
- Headline Chrome: `text:'Verify AI-generated code at the pace it's written.'` (TextView en WebView)
- URL bar: `saucelabs.com` (`com.android.chrome:id/url_bar`)

### Flujos existentes reutilizables
- `OpenApp`, `TapMenuItem`, `AssertVisibleText`

### Riesgos / blockers
- **Navegador externo** (Chrome): el assert cruza de app; Maestro lo resolvió en scout con el mismo `appId` de My Demo App.
- Posible diálogo "Abrir con…" si no hay browser por defecto.
- Banner ISO + **cookie consent** en saucelabs.com — el headline quedó visible por encima en scout.
- Copy de marketing puede cambiar en saucelabs.com → flakiness de assert.
- iOS no scouted.
- Varios seriales adb; usar el que permita `launchApp`.

## Escenarios (Gherkin)

```gherkin
Feature: About My Demo App
  Como usuario de My Demo App
  Quiero abrir el sitio de Sauce Labs desde About
  Para verificar la redirección al navegador externo

  Scenario: Abrir Sauce Labs desde About
    Given abro My Demo App en la pantalla principal
    When abro el menú y pulso "About"
    And pulso el enlace al sitio de Sauce Labs
    Then veo el texto "Verify AI-generated code at the pace it's written."
```

> Ejecución: `npm run feature -- --feature maestro/features/MyDemoAppAbout.feature --platform android --no-publish`

## Plan de automatización

- Feature: `maestro/features/MyDemoAppAbout.feature`
- Step-definitions: `step-definitions/about.json` (nuevo: `pulso el enlace al sitio de Sauce Labs` → `TapSauceLabsWebsiteLink`) | reutiliza `common.json`: OpenApp, TapMenuItem, AssertVisibleText
- Flows: `TapSauceLabsWebsiteLink` (+ `android/`: tap `webTV`, wait headline o URL)
- Reutiliza: `OpenApp`, `TapMenuItem`, `AssertVisibleText`

## Cobertura por plataforma

- iOS: fuera de alcance.
- Android: alcance completo — verificado en scout (Chrome).

## Selectores clave

- About link: `id:com.saucelabs.mydemoapp.android:id/webTV` — scout
- Headline: `text:'Verify AI-generated code at the pace it's written.'` — scout

## Decisiones

- Un escenario feliz About → Chrome → assert headline exacto.
- Assert en navegador externo con el mismo runner (probado en scout).
- Esperar tras el tap al link por carga de red / Chrome.
- No automatizar cierre del cookie banner salvo que tape el headline.

## Casos límite confirmados

- (ninguno) — no se prueba chooser de apps ni back a la app.

## Fuera de alcance

- iOS / Safari.
- Interacción en saucelabs.com (Sign up, cookies).
- Verificar package Chrome explícitamente (solo copy visible).

## Riesgos / Notas

- Dependencia de red y copy vivo de saucelabs.com.
- Preferir serial estable en `ANDROID_SERIAL` (el mDNS TLS funcionó en scout).

## Sanity (post-ejecución)

**Fecha:** 2026-07-21
**Veredicto:** OK
**Run:** `reports/summary.json` — 1 passed / 0 failed (android); iOS fuera de alcance

### Trazabilidad criterio → test
| Criterio / HU | Paso Gherkin | Flow / aserción | ¿Suficiente? |
|---------------|--------------|-----------------|--------------|
| Entrar en la app | abro My Demo App… | OpenApp | sí |
| Abrir panel lateral y About | abro el menú y pulso "About" | TapMenuItem → menuIV + About | sí |
| Pulsar About | abro el menú y pulso "About" | TapMenuItem MENU_ITEM=About | sí |
| Pulsar enlace Sauce Labs | pulso el enlace al sitio de Sauce Labs | TapSauceLabsWebsiteLink → webTV | sí |
| Headline en navegador | veo el texto "Verify AI-generated code…" | AssertVisibleText (+ wait en flow) | sí — Chrome externo |

### Huecos detectados
- (ninguno) respecto a la HU; iOS diferido

### Acción
- cerrar — Gate Automatizado (Android)

## Gate / Resultado

- **Automatizado (Android)** — scenario verde 2026-07-21
- iOS: diferido (sin tooling/simulador)
