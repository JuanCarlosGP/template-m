# Izertis Maestro Template

**Versión:** 0.3.3

Plantilla del framework de tests E2E con **Maestro** y **Gherkin**. App de demo: **[Sauce Labs My Demo App](https://github.com/saucelabs/my-demo-app-android)** (Android, `com.saucelabs.mydemoapp.android`). Sustituye o amplía con tests de tu app.

## Stack

- Framework: Maestro
- Plataforma: iOS / Android
- Runner: Gherkin → step-definitions → flows YAML
- **Contrato de ejecución:** npm (Windows, macOS, Linux, CI)

---

## Capas del template

### Core (siempre)

Gherkin, step-definitions, flows Maestro, runner y validación estática. Funciona sin Azure ni CI concreto; los escenarios contra My Demo App requieren dispositivo Android con la app instalada.

```
features/ ──► gherkin-runner.js ──► step-definitions/ ──► flows/*.yml ──► dispositivo
                    │
                    └──► reports/summary.json + junit.xml  (post-ejecución)
```



### Calidad portable

```bash
npm run check      # test + validate + gherkin-extract (strict) — gate CI recomendado
npm run validate   # Gherkin, schema step-defs, flows (sin dispositivo)
npm test           # unit tests del framework
```

Detalle CI: `[docs/CI.md](docs/CI.md)`. Ejemplos copiables en `[integrations/](integrations/README.md)` (GitHub Actions, Azure Pipelines, GitLab CI).

### Integraciones opcionales (por cliente)


| Integración        | Cuándo                      | Cómo                                                                                                 |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Azure Test Plans   | Cliente usa Azure DevOps QA | `publish-results.js`, vars en `.env`, quitar `--no-publish`                                          |
| BrowserStack       | Ejecución en cloud          | `--executor browserstack`                                                                            |
| Agente IA (issue → test) | Automatizar desde issue/HU | [`docs/agent/`](docs/agent/README.md), [`e2e-specs/`](e2e-specs/README.md), [`.mcp.json`](.mcp.json) |




### De la issue al test E2E (agente IA)

Opcional — no necesario para `npm run check` ni CI headless.

```
ticket → environment-scout → test-planner → e2e-specs/specs/<id>.md → author-e2e-test → sanity-reviewer
```

- [`docs/agent/`](docs/agent/) — playbooks; empezar por [`workflow.md`](docs/agent/workflow.md) o [`author-e2e-test`](docs/agent/author-e2e-test/SKILL.md)
- [`e2e-specs/specs/`](e2e-specs/README.md) — specs de automatización por ticket (no [OpenSpec](https://openspec.dev/))
- [`.mcp.json`](.mcp.json) — solo MCP `maestro` por defecto; TMS opcional (Azure, GitHub, GitLab) → [`docs/agent/mcp-examples.md`](docs/agent/mcp-examples.md)

Reglas para agentes: [`AGENTS.md`](AGENTS.md).

#### Usar el agente (rápido)

**Antes:** emulador o simulador con la app instalada, `.env` configurado, MCP `maestro` en [`.mcp.json`](.mcp.json) (TMS opcional para leer la issue — ver [`mcp-examples.md`](docs/agent/mcp-examples.md)).

En el chat de agente de tu IDE (p. ej. VS Code + extensión de agentes, u otro IDE compatible), escribe `/author-e2e-test` (skills en [`.agents/skills/`](.agents/skills/)) o pega:

```
Automatiza la issue #123 siguiendo docs/agent/author-e2e-test/SKILL.md
```

Otros slash: `/debug-flow`, `/run-tests-e2e`, `/committing`. Si no aparecen, recarga la ventana una vez.

**Qué hará el agente:**

1. Inspeccionar la app en dispositivo (Maestro MCP)
2. Redactar el plan en `e2e-specs/specs/<id>.md` y pedirte confirmación
3. Crear feature, step-definitions y flows; ejecutar hasta verde
4. Revisar que el test cubre la HU (sanity)
5. Opcional: commit y PR en borrador

Detalle del pipeline: [`docs/agent/workflow.md`](docs/agent/workflow.md). Dispositivo: [`docs/DEVICE.md`](docs/DEVICE.md).

---



## Catálogo vs resultados de ejecución


| Herramienta                                                 | Momento              | Salida                            |
| ----------------------------------------------------------- | -------------------- | --------------------------------- |
| `[gherkin-dictionary](maestro/scripts/gherkin-dictionary/)` | Estático, sin device | Catálogo paso → step-def → flow   |
| `reports/` (tras `npm run feature`)                         | Post-ejecución       | Pass/fail, errores, JUnit para CI |


---



## Requisitos

- **Node.js 20+**
- **Maestro CLI** — instalado por `npm run setup` en macOS/Linux; en Windows nativo, instalar manualmente ([docs Maestro](https://docs.maestro.dev/getting-started/installing-maestro))
- Para ejecución en dispositivo: simulador iOS o emulador Android con la app instalada (Android Studio / Xcode)



## Compatibilidad por SO

El **contrato del template** es npm + Node 20; funciona en Windows, macOS y Linux. La ejecución en **dispositivo** depende del SO y de la plataforma móvil (iOS solo en macOS de forma local).


| Capa                                                | Windows | macOS | Linux |
| --------------------------------------------------- | ------- | ----- | ----- |
| Calidad headless (`npm run check`, validate, tests) | Sí      | Sí    | Sí    |
| Agente IA (`docs/agent/`)                           | Sí      | Sí    | Sí    |
| CI (GitHub / Azure / GitLab)                        | Sí      | Sí    | Sí    |
| Instalación Maestro vía `npm run setup`             | Manual  | Sí    | Sí    |
| E2E **Android** en emulador/dispositivo             | Sí      | Sí    | Sí    |
| E2E **iOS** en simulador                            | No      | Sí    | No    |


Notas:

- **Windows:** instala Maestro manualmente si `npm run setup` lo indica. Ajusta la ruta de `maestro` en `[.mcp.json](.mcp.json)` si usas el MCP del IDE. Emulador Android con Android Studio.
- **macOS:** único SO con soporte local **iOS + Android** (Xcode + Android Studio).
- **Linux:** Android en emulador; iOS solo vía CI macOS, agente cloud (p. ej. BrowserStack) o `--executor browserstack`.
- `npm run doctor` puede fallar sin `adb`/`xcrun` aunque `npm run check` pase — normal en máquinas solo headless.

Comandos CLI de emuladores (macOS/Linux): `[docs/DEVICE.md](docs/DEVICE.md)`.

---



## Instalación

```bash
npm run setup
```

Crea `.env` desde la plantilla, instala dependencias npm, intenta instalar Maestro (Unix) e ejecuta `doctor`.

En Windows, si Maestro no está en PATH, sigue las instrucciones que imprime el script o instálalo manualmente y vuelve a ejecutar `npm run doctor`.

```bash
npm run doctor     # deps, Maestro, dispositivos
npm run check      # gate headless (recomendado en CI)
```

---



## Variables de entorno

Plantilla: `[.env.example](.env.example)` — bloques **Core**, **Reporting**, **Azure (opcional)**, **BrowserStack (opcional)**, **IDE MCP (opcional)**.

- **Core:** `ANDROID_APP_ID`, `IOS_APP_ID`, `APP_SOURCE_DIR`, credenciales de demo, etc.
- **Azure (opcional):** `AZURE_TEST_PLAN_ID`, `AZURE_TEST_SUITE_ID` (alias legacy `PLAN_ID` / `SUITE_ID`), `AZURE_DEVOPS_PAT` para publicar resultados.
- **IDE MCP (opcional):** `GITHUB_TOKEN` si añades el MCP de GitHub en `[.mcp.json](.mcp.json)` — ver `[docs/agent/mcp-examples.md](docs/agent/mcp-examples.md)`. No lo usa ningún script npm.

---



## App de ejemplo (Sauce Labs My Demo App)

App open-source de Sauce Labs — Android. Package ID: `com.saucelabs.mydemoapp.android`.

| Recurso | Valor |
|---------|-------|
| Repositorio | [saucelabs/my-demo-app-android](https://github.com/saucelabs/my-demo-app-android) |
| `ANDROID_APP_ID` | `com.saucelabs.mydemoapp.android` |
| Step-definitions | `maestro/step-definitions/{common,auth,webview,about}.json` |
| Flow base | `maestro/flows/OpenApp.yml` |

**Prerrequisitos:** dispositivo o emulador Android, My Demo App instalada (APK desde [releases](https://github.com/saucelabs/my-demo-app-android/releases)), `.env` con `ANDROID_APP_ID=com.saucelabs.mydemoapp.android` y `ANDROID_SERIAL` si aplica. Ver [`docs/DEVICE.md`](docs/DEVICE.md).

---

## Tras crear tu proyecto

Al hacer fork de la template, añade tests de **tu** app siguiendo el mismo patrón (Gherkin → step-defs → flows):

| Acción | Qué hacer |
|--------|-----------|
| **Añadir** | `features/`, `step-definitions/<area>.json`, flows en `flows/` (+ `android/` / `ios/` si aplica) |
| **Configurar** | `.env` (app IDs, `APP_SOURCE_DIR`, `ANDROID_SERIAL`); Azure solo si publicas en Test Plans |
| **Conservar** | Estructura de carpetas, `npm run check`, ejemplos CI en [`integrations/`](integrations/README.md) |
| **Opcional** | Agente IA: `docs/agent/`, `e2e-specs/`, [`.mcp.json`](.mcp.json) + [`mcp-examples.md`](docs/agent/mcp-examples.md); BrowserStack; publicación Azure |

Pipeline agente: [`docs/agent/workflow.md`](docs/agent/workflow.md).

---



## Ejecución

```bash
npm run check                        # gate headless (preferido tras cambios)
npm test
npm run validate
npm run doctor
npm run feature -- --feature maestro/features/<TuFeature>.feature --platform android --no-publish
npm run flow:android -- --flow maestro/flows/OpenApp.yml
npm run gherkin-extract
npm run gherkin-report
```

Pasa `--no-publish` al runner para no publicar en Azure.

Tras un run con el runner, revisa `reports/summary.json` y `reports/junit.xml` (desactivar con `--no-reports`).

Suite completa desde Azure Test Plans (opcional):

```bash
node maestro/scripts/gherkin-runner.js --from-suite --platform all --no-publish
```

(`AZURE_TEST_PLAN_ID` y `AZURE_TEST_SUITE_ID` en `.env`, o `--plan-id` / `--suite-id` en CLI.)

---



## Dispositivos

Antes de `npm run feature` o `npm run flow:*`, arranca simulador/emulador e instala la app (Android Studio / Xcode). Comandos CLI opcionales: `[docs/DEVICE.md](docs/DEVICE.md)`.

---



## Diccionario Gherkin

`[maestro/scripts/gherkin-dictionary/README.md](maestro/scripts/gherkin-dictionary/README.md)`

```bash
npm run gherkin-report      # extrae y abre la UI
npm run gherkin-extract     # solo regenera JSON/CSV
```

---

## Editor (VS Code y compatibles)

Los pasos Gherkin se resuelven en **`maestro/step-definitions/*.json`**, no en `.js`/`.ts`. La extensión **Cucumber (oficial)** marca pasos como *Undefined step* aunque `npm run validate` esté en verde.

El workspace incluye [`.vscode/extensions.json`](.vscode/extensions.json):

| Extensión | ID | Uso |
|-----------|-----|-----|
| **Cucumber (Gherkin) Syntax and Snippets** | `stevejpurves.cucumber` | Recomendada — resaltado y snippets |
| **Cucumber (oficial)** | `CucumberOpen.cucumber-official` | No recomendada en este template |

Al abrir el repo, el IDE puede sugerir instalar la extensión ligera.

**Importante:** si tienes instalada **Cucumber (oficial)** (`CucumberOpen.cucumber-official`), desactívala en este workspace: Extensions → *Cucumber* → **Disable (Workspace)**. El reload solo no la quita; `unwantedRecommendations` no la desinstala.

El workspace asocia `*.feature` al lenguaje `feature` (extensión `stevejpurves.cucumber`), no a `cucumber` (oficial). Si el aviso *Undefined step* sigue, es porque la oficial sigue activa.

Comprobación fiable de pasos: `npm run validate` o `npm run gherkin-report`.

---

## Estructura del proyecto

```text
izertis-maestro-template/
├── .vscode/               # extensión Gherkin recomendada (ver README § Editor)
├── .env.example           # plantilla de configuración (copiar a .env)
├── .mcp.json              # MCP maestro (TMS opcional — ver docs/agent/mcp-examples.md)
├── AGENTS.md              # reglas para agentes IA
├── docs/
│   ├── README.md          # índice de documentación
│   ├── CI.md
│   ├── DEVICE.md
│   └── agent/             # workflow + playbooks (issue → sanity)
├── e2e-specs/             # specs de planificación E2E (opcional)
├── integrations/          # ejemplos CI headless (copiar al proyecto cliente)
├── reports/               # resultados (gitignored)
└── maestro/
    ├── features/
    ├── flows/ shared/ ios/ android/
    ├── step-definitions/
    └── scripts/
        ├── hooks/         # hooks IDE opcionales
        ├── check.js
        ├── setup.js
        └── ...
```

---

