# [manual-counter] Panel 01 COUNTER (Appium Practice)

**Type:** E2E Test Automation
**Status:** Done
**Date:** 2026-07-14
**Source:** manual (petición usuario — sin issue TMS)
**Test Case:** (manual)
**Gherkin:** propuesto

---

## Objetivo

Verificar la funcionalidad completa del panel **01 COUNTER**: valor inicial, incremento, decremento (incl. negativos) y reset.

## Criterios de aceptación

1. Al entrar en **01 COUNTER**, el contador muestra **0**.
2. Pulsar **+** incrementa el valor mostrado.
3. Pulsar **-** decrementa el valor mostrado (permite negativos).
4. Pulsar **R** resetea el contador a **0**.

## Reconocimiento del entorno

**Fecha:** 2026-07-14
**Dispositivos:** Nothing A063 (Android 15), Wi‑Fi `192.168.1.45:42071`
**Build / appId:** `com.expandtesting.practice`

### Selectores observados (MCP)

| Elemento | Selector |
|----------|----------|
| Valor contador | `id:com.expandtesting.practice:id/tv_counter` |
| Incrementar (+) | `id:com.expandtesting.practice:id/btn_increment` |
| Decrementar (-) | `id:com.expandtesting.practice:id/btn_decrement` |
| Reset (R) | `id:com.expandtesting.practice:id/btn_reset` |
| Entrada panel | texto `01 COUNTER` en pantalla principal |

## Escenarios (Gherkin)

Ver `maestro/features/AppiumPracticeCounter.feature`.

## Plan de automatización

- Feature: `maestro/features/AppiumPracticeCounter.feature`
- Step-definitions: `step-definitions/appium-practice.json` (ampliado)
- Flows: `ExpandBankOpenApp` (reuso), `TapAppSection`, `AssertCounterValue`, `CounterIncrement`, `CounterDecrement`, `CounterReset`

## Cobertura por plataforma

- Android: flujo completo
- iOS: fuera de alcance (demo Play Store)

## Gate / Resultado

- **PASS** — incremento, decremento (negativos) y reset verificados en Android.

## Sanity (post-ejecución)

- **2026-07-14:** `npm run feature:counter` → **PASS** (Nothing A063, `192.168.1.45:42071`).
- `npm run check` → OK (46 tests).
- Criterios 1–4 cubiertos por asserts de valor tras cada operación.
