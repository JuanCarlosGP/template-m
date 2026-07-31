# [demo-webview-wikipedia] Abrir Wikipedia en WebView

**Type:** E2E Test Automation
**Status:** Automatizado (Android)
**Date:** 2026-07-21
**Source:** manual (pasos HU pegados por el usuario)
**Test Case:** (desconocido)
**Gherkin:** propuesto

---

## Objetivo

Verificar que desde el menú lateral se puede abrir la sección WebView, introducir una URL HTTPS (Wikipedia) y que el contenido cargado muestra el slogan de Wikipedia.

## Criterios de aceptación (HU / Issue)

1. Se entra en la app `com.saucelabs.mydemoapp.android`.
2. Se abre el panel lateral izquierdo con el botón hamburguesa.
3. Se pulsa el apartado "WebView".
4. Se pulsa el input de texto de URL.
5. Se establece la URL de Wikipedia (`https://www.wikipedia.org`).
6. Se pulsa el botón "Go To Site".
7. Se verifica que aparece el slogan de Wikipedia ("The Free Encyclopedia" o equivalente visible).

## Reconocimiento del entorno

**Fecha:** 2026-07-21
**Dispositivos:** `192.168.1.45:40903` (Android real) — hay un 2º device adb TLS; iOS no disponible
**Build / appId:** `com.saucelabs.mydemoapp.android`

### Estado inicial
- Tras `launchApp` (clearState): catálogo Products → menú → **WebView**.

### Pantallas relevantes para la HU
| Pantalla | iOS | Android | Notas |
|----------|-----|---------|-------|
| Formulario Webview | no verificado | visto — título "Webview", campo URL, "Go To Site" | HTTPS requerido (copy en UI) |
| Wikipedia (WebView) | no verificado | visto — slogan + idiomas | Contenido web; depende de red |

### Selectores observados (MCP)
- Menú hamburguesa: `id:com.saucelabs.mydemoapp.android:id/menuIV`
- Ítem menú: `text:'WebView'`
- Campo URL: `id:…:id/urlET` (hint/default `https://www.website.com`)
- Botón: `id:…:id/goBtn` / `text:'Go To Site'` (a11y "Tap to view content of given url")
- Slogan en WebView: texto exacto en jerarquía `Wikipedia The Free Encyclopedia` (visualmente "WIKIPEDIA" + "The Free Encyclopedia")

### Flujos existentes reutilizables
- `OpenApp`
- `TapMenuItem` (abre menú + tap del ítem)
- `AssertVisibleText`

### Riesgos / blockers
- iOS no scouted → solo Android.
- Contenido Wikipedia puede variar (copy/layout); preferir assert del string visto en jerarquía o regex `.*The Free Encyclopedia.*`.
- Requiere red HTTPS; posible flakiness / timeout al cargar.
- Campo URL trae valor por defecto → hace falta `eraseText` (o clear) antes de `inputText`.
- `ANDROID_SERIAL` en `.env` puede quedar desfasado si hay varios devices / cambio de puerto.

## Escenarios (Gherkin)

```gherkin
Feature: WebView My Demo App
  Como usuario de My Demo App
  Quiero abrir una URL HTTPS en el WebView
  Para verificar que el contenido remoto se muestra correctamente

  Scenario: Abrir Wikipedia en el WebView
    Given abro My Demo App en la pantalla principal
    When abro el menú y pulso "WebView"
    And navego a la URL "https://www.wikipedia.org"
    Then veo el texto "Wikipedia The Free Encyclopedia"
```

> Ejecución: `npm run feature -- --feature maestro/features/MyDemoAppWebView.feature --platform android --no-publish`

## Plan de automatización

- Feature: `maestro/features/MyDemoAppWebView.feature`
- Step-definitions: `step-definitions/webview.json` (nuevo: `navego a la URL "(.+)"` → `WebViewNavigateUrl`) | reutiliza `common.json`: OpenApp, TapMenuItem, AssertVisibleText
- Flows: `WebViewNavigateUrl` (+ `android/`: tap `urlET`, eraseText, inputText `${URL}`, tap `goBtn`, wait visible contenido)
- Reutiliza: `OpenApp`, `TapMenuItem`, `AssertVisibleText`

## Cobertura por plataforma

- iOS: fuera de alcance (sin device).
- Android: alcance completo — flujo verificado en scout.

## Selectores clave

- URL field: `id:com.saucelabs.mydemoapp.android:id/urlET` — scout
- Go To Site: `id:…:id/goBtn` — scout
- Assert slogan: `text:'Wikipedia The Free Encyclopedia'` — scout (jerarquía WebView)

## Decisiones

- Un escenario feliz: menú → WebView → Wikipedia → assert slogan.
- URL explícita HTTPS `https://www.wikipedia.org` (la app pide HTTPS).
- Assert del string completo visto en jerarquía (más estable que partial "The free Encyclopedia" con matcher full-string).
- Reutilizar `TapMenuItem` con `"WebView"` (mismo patrón que login/logout).
- Incluir espera tras "Go To Site" por carga de red.

## Casos límite confirmados

- (ninguno) — no se prueba URL inválida / HTTP / clear URL vacío.

## Fuera de alcance

- iOS.
- Otras URLs / sitios.
- Interacción dentro de Wikipedia (buscar, idiomas).

## Riesgos / Notas

- Dependencia de red y posible cambio de copy en wikipedia.org.
- Tras Go To Site el formulario nativo desaparece y solo queda el WebView.

## Sanity (post-ejecución)

**Fecha:** 2026-07-21
**Veredicto:** OK
**Run:** `reports/summary.json` — 1 passed / 0 failed (android); iOS fuera de alcance

### Trazabilidad criterio → test
| Criterio / HU | Paso Gherkin | Flow / aserción | ¿Suficiente? |
|---------------|--------------|-----------------|--------------|
| Entrar en la app | abro My Demo App… | OpenApp | sí |
| Abrir panel lateral y WebView | abro el menú y pulso "WebView" | TapMenuItem → menuIV + WebView | sí |
| Pulsar WebView | abro el menú y pulso "WebView" | TapMenuItem MENU_ITEM=WebView | sí |
| Input URL + Wikipedia | navego a la URL "https://www.wikipedia.org" | WebViewNavigateUrl (urlET, eraseText, input, goBtn) | sí |
| Pulsar Go To Site | (incluido en navego a la URL) | tap goBtn | sí |
| Slogan Wikipedia | veo el texto "Wikipedia The Free Encyclopedia" | AssertVisibleText | sí — string exacto de jerarquía |

### Huecos detectados
- (ninguno) respecto a la HU; iOS diferido de forma explícita

### Acción
- cerrar — Gate Automatizado (Android); iOS pendiente

## Gate / Resultado

- **Automatizado (Android)** — scenario verde 2026-07-21
- iOS: diferido (sin tooling/simulador en este entorno)
