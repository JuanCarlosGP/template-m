# [manual-webview] Panel 10 WEBVIEW (Appium Practice)

**Type:** E2E Test Automation
**Status:** Done
**Date:** 2026-07-14
**Source:** manual (petición usuario)
**Gherkin:** propuesto

---

## Objetivo

Verificar navegación WebView: estado inicial, GO con URL, contenido cargado, CLEAR y segunda navegación. URLs de prueba: **Wikipedia** (sin anuncios).

## Criterios de aceptación

1. Al entrar en **10 WEBVIEW**, el mensaje **Please navigate to a web page** está visible.
2. Navegar a `https://en.wikipedia.org/wiki/Main_Page` muestra **Welcome to Wikipedia**.
3. **CLEAR** restaura el placeholder inicial.
4. Navegar a `https://en.wikipedia.org/wiki/WebView` muestra el artículo **WebView**.

## Selectores (MCP)

| Elemento | Selector |
|----------|----------|
| URL | `id:com.expandtesting.practice:id/et_url` |
| GO | `id:com.expandtesting.practice:id/btn_go` |
| CLEAR | `id:com.expandtesting.practice:id/btn_clear` |

## Decisiones

- Wikipedia en lugar de `practice.expandtesting.com` para evitar anuncios y flakiness en asserts.

## Gate / Resultado

- **PASS** — navegación, CLEAR y asserts WebView verificados en Android (Wikipedia).

## Sanity (post-ejecución)

- **2026-07-14:** `npm run feature:webview` → **PASS** (`192.168.1.45:42071`).
- Requiere red para cargar `en.wikipedia.org`.
