# `maestro/shared/` — layout

Maestro YAML entries live here. Gherkin steps map via step-definitions
(`"flow": "<area>/<Name>"` → `shared/<area>/<Name>.yml`). There is no
`maestro/flows/` catalog.

| Folder | Role |
| --- | --- |
| `<area>/` | Journey for one step-definitions file (`common`, `auth`, `webview`, `about`). |
| `harness/` | Infra used by two or more areas, when a suite grows past one feature. |

`maestro/android/` and `maestro/ios/` are OS chrome only. App-screen diffs that
are platform-specific can live next to the area (`shared/<area>/android/`,
`shared/<area>/ios/`).
