# Diccionario Gherkin — Izertis Maestro Template

Catálogo local de pasos Gherkin de la app móvil: extrae los `.feature`, los cruza con las definiciones de `maestro/step-definitions/` y genera una UI consultable con trazabilidad hasta los flows Maestro (`.yml`).

## Para qué sirve

- **Inventariar** qué pasos Gherkin existen en el proyecto.
- **Consultar** cómo se expresan los escenarios (Given / When / Then…) sin abrir cada `.feature`.
- **Validar** que cada paso del feature tiene definición en JSON (`pasosSinDefinicion: 0`).
- **Detectar** definiciones JSON que no se usan en ningún feature.
- **Redactar** nuevos escenarios con el Constructor Gherkin de la UI (pasos del catálogo + copiar al portapapeles).

No ejecuta tests. El runner sigue siendo `gherkin-runner.js`; este módulo es documentación viva y herramienta de revisión.

## Flujo de datos

```text
maestro/features/*.feature
        │
        ▼  parseFeatureFile.js
   sentencias crudas (tipo, texto, escenario, archivo…)
        │
        ▼  enrichStatements.js  +  maestro/step-definitions/index.js
   sentencias enriquecidas (pattern, flow, maestroFlowPath, definitionFile…)
        │
        ├──► reports/gherkin-extraction.json
        ├──► reports/gherkin-extraction.csv   (gitignored)
        └──► reports/index.html               (lee el JSON vía fetch)
```

## Estructura de esta carpeta

```text
gherkin-dictionary/
├── extract.js           # Punto de entrada (CLI)
├── lib/
│   ├── extractGherkinData.js   # Orquesta extracción, analytics y escritura
│   ├── parseFeatureFile.js     # Parser de .feature (Scenario + pasos)
│   ├── enrichStatements.js     # Cruce con step-definitions + warnings
│   └── generateCSV.js          # Export CSV
└── reports/
    ├── index.html              # UI del catálogo (Preact + Tailwind CDN)
    ├── gherkin-extraction.json # Generado; gitignored
    └── gherkin-extraction.csv  # Generado; gitignored
```

## Cómo ejecutarlo

Desde la raíz del repo (`izertis-maestro-template`):

```bash
npm run gherkin-report              # extrae y abre la UI en el navegador
npm run gherkin-report -- --port 3000
npm run gherkin-extract             # solo regenera JSON/CSV
```

Requisito: **Node.js ≥ 20**.

## Salida JSON

Cada extracción produce un objeto con:

| Campo | Descripción |
| --- | --- |
| `generatedAt` | Fecha/hora de generación (ISO) |
| `analytics` | Totales, pasos por tipo, pasos sin definición, placeholders Outline, definiciones sin uso |
| `sentencias` | Lista de pasos extraídos de features, enriquecidos |
| `definiciones` | Catálogo completo de `step-definitions/*.json` con flag `usadoEnFeatures` |

Campos útiles por sentencia: `pattern`, `flow`, `maestroFlowPath`, `definitionFile`, `executesFlow`, `description`.

Si `analytics.pasosSinDefinicion > 0`, hay pasos en `.feature` sin entrada en `step-definitions/`. El extractor también lo avisa por consola y termina con **exit code 1** (útil para CI).

## UI (`reports/index.html`)

Vistas disponibles:

- **Pasos** — agrupados por texto (con ocurrencias en distintos escenarios).
- **Features** — agrupados por archivo `.feature`.
- **Casos** — agrupados por escenario.
- **Definiciones** — catálogo JSON con enlace al flow Maestro cuando aplica.

Incluye búsqueda, filtros por tipo (Given/When/Then…), **Constructor Gherkin** (montar escenarios y copiar) y escenarios guardados en `localStorage` del navegador.

> Ejecuta `npm run gherkin-extract` (o `npm run gherkin-report`) antes de abrir la UI si acabas de cambiar features o step-definitions.

## Relación con el runner

| Componente | Rol |
| --- | --- |
| `maestro/features/` | Escenarios Gherkin (fuente del diccionario) |
| `maestro/step-definitions/*.json` | Patrones → nombre de flow Maestro |
| `maestro/step-definitions/index.js` | Resolución de pasos (runner + enricher) |
| `maestro/flows/`, `maestro/shared/` | Flows `.yml` referenciados en definiciones |
| `gherkin-runner.js` | Ejecuta tests; no forma parte de este módulo |

El diccionario reutiliza la misma lógica de matching que el runner (`resolveStepSafe`, orden por longitud de pattern).

## Mantenimiento

1. Añade o edita pasos en `maestro/features/*.feature`.
2. Si el paso es nuevo, crea o actualiza el JSON en `maestro/step-definitions/`.
3. Ejecuta `npm run gherkin-extract` y comprueba que no haya warnings.
4. Revisa la UI con `npm run gherkin-report`.

Al añadir una feature nueva, basta con crear `step-definitions/<feature>.json`; `index.js` lo carga automáticamente.

## Notas

- El parser es intencionadamente simple (no usa `@cucumber/gherkin`). Soporta `Background:`, `Scenario` / `Scenario Outline`, tags a nivel **Feature**, **Background** y **Scenario**, y pasos Given/When/Then/And/But. Los pasos de Background aparecen con `scenario: "Background"`. Los pasos con placeholders **`<...>`** (Scenario Outline) se listan pero no se intentan resolver contra step-definitions (warning + excluidos de `pasosSinDefinicion`).
- La UI depende de CDN (Tailwind, Preact); hace falta conexión a internet para renderizar.
- Proyecto web (Playwright) tiene un catálogo similar pero separado; no comparte extract ni JSON con este módulo.
