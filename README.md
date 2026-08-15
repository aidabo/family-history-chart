# Family / Dynasty History Chart

> Interactive **family tree · genealogy · timeline · relationship-graph** editor for React — built on **D3** + **TypeScript**.
> 家系図・系図・年表・関係図をブラウザで描画・編集する React コンポーネントライブラリ。

<p align="left">
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <img alt="D3" src="https://img.shields.io/badge/D3-7-F9A03C?logo=d3.js&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-lib_build-646CFF?logo=vite&logoColor=white">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-ja%20%2F%20en%20%2F%20zh-informational">
</p>

`@ghost-next/family-chart` renders and edits **person graphs** — parents, spouses, teachers, lieges, custom relations — with four switchable layouts, on-canvas editing, CSV import/export, note annotations, freehand whiteboard, and A4 thumbnail/print export. It runs **standalone** against a bundled REST/JSON backend, or plugs into a host app via a single `store` injection point.

## 🎬 Demo

A short walkthrough of layout switching, on-canvas editing, and export.

<!--
  For inline playback ON GITHUB, paste a GitHub-hosted asset URL below.
  How to get one: open this README in the github.com editor (or a new issue),
  drag-and-drop docs/assets/chart-demo.mp4 into the text box, and GitHub uploads
  it and inserts a URL like
    https://github.com/<owner>/<repo>/assets/<id>/<uuid>.mp4
  Replace PASTE_GITHUB_ASSET_URL_HERE with that URL and delete this comment.
  (A relative path or raw.githubusercontent.com URL will NOT play inline on GitHub.)
-->

https://github.com/OWNER/REPO/assets/PASTE_GITHUB_ASSET_URL_HERE

▶️ Meanwhile, the committed file always works:
**[Watch the demo video](docs/assets/chart-demo.mp4)** — opens a player on GitHub's
file view, or plays inline in local Markdown viewers (VS Code, etc.).

---

## ✨ Features

- 🌳 **Four layout modes** — 系図 *(tidy tree)*, 年表 *(timeline)*, 関係図 *(force graph)*, and **auto**. Switch live; node positions are preserved.
- 👤 **Rich node shapes** — circular portraits, photo cards, rectangles, circles, and union nodes. Images, videos, or generated silhouettes.
- 🔗 **11 relation types + custom** — marriage / remarriage / parent-child / teacher(師) / liege(主従) / … with trilingual edge labels and per-type colors & dashes.
- 🎛️ **On-canvas editing** — drag to move, Ctrl+click to connect, double-click to rename, inline note editing, resize handles.
- 🧮 **Relation filter & node search** — hide/show relation kinds; jump to any person by name/title.
- 📝 **Note annotations** — sticky / speech-bubble / manga-frame notes, vertical (CJK) text supported.
- ✏️ **Freehand whiteboard** — draw & annotate over the chart; strokes persist with the page.
- ⌨️ **Keyboard-first** — arrow-key node nudging, viewport panning, Esc/Delete shortcuts. See [`docs/shortcuts.md`](docs/shortcuts.md).
- 🖼️ **Thumbnail & print export** — A4-landscape PNG/JPEG snapshot of the visible viewport (photos inlined & downscaled).
- 🌐 **i18n** — Japanese / English / Chinese out of the box; host can inject its own translator.
- 🔌 **Pluggable persistence** — bundled REST store for standalone use, or inject a `store` (e.g. a CMS `social_charts` API) with zero library changes.
- 📄 **CSV & JSON import/export** — bulk-load people and relationships. Formats: [`docs/csv-format.md`](docs/csv-format.md), [`docs/chart-json-format.md`](docs/chart-json-format.md).

## 📦 Installation

```bash
# from this monorepo it is exposed as @ghost-next/family-chart
yarn add @ghost-next/family-chart
```

Peer runtime: **React 18** and **react-dom 18**.

```ts
import '@ghost-next/family-chart/style.css' // bundled Tailwind styles
```

## 🚀 Quick Start

Wrap your app in `DataProvider`, then drop in `FamilyChartEditor` (single chart) or `FamilyChartList` (chart gallery). The provider talks to a REST backend at `apiBaseUrl` by default.

```tsx
import { useState } from 'react'
import {
  DataProvider,
  FamilyChartEditor,
  FamilyChartList,
} from '@ghost-next/family-chart'
import '@ghost-next/family-chart/style.css'

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'view'>('edit')

  return (
    <DataProvider apiBaseUrl="/api/charts" locale="ja">
      {openId ? (
        <FamilyChartEditor
          id={openId}
          mode={mode}
          onBack={() => setOpenId(null)}
          onOpenView={(id) => { setMode('view'); setOpenId(id) }}
          onOpenEdit={(id) => { setMode('edit'); setOpenId(id) }}
        />
      ) : (
        <FamilyChartList
          onOpenEdit={(id) => { setMode('edit'); setOpenId(id) }}
          onOpenView={(id) => { setMode('view'); setOpenId(id) }}
        />
      )}
    </DataProvider>
  )
}
```

Run the bundled dev backend (json-server) alongside Vite:

```bash
yarn dev   # vite + json-server on :3195 (see package.json)
```

## 🧩 Public API

| Export | Type | Purpose |
| --- | --- | --- |
| `DataProvider` | component | Data/context root. Wires persistence, locale, upload & thumbnail hooks. |
| `useDataContext` | hook | Access chart state and actions inside custom UI. |
| `FamilyChartEditor` | component | Full editor for one chart (toolbar, canvas, dialogs). |
| `FamilyChartList` | component | Gallery of charts with open/edit actions. |
| `DynastyNetwork` | component | The D3 canvas itself (advanced/embedding use). |
| `NodeCard`, `EdgeCard`, `RelationshipTypeDialog` | components | Building blocks for custom editors. |
| `PageProps`, `ChartProps`, `PersonNode`, `Relationship`, `NodeShape` | types | Data model. |

### `DataProvider` props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | App subtree. |
| `apiBaseUrl` | `string` | `/api/charts` | REST base for the bundled store. |
| `locale` | `string` | `'ja'` | `ja` / `en` / `zh`. |
| `uploadFile` | `(file) => Promise<string>` | — | Optional image/video upload → returns URL. |
| `uploadThumbnail` | `(chartId, blob) => Promise<string>` | — | Optional thumbnail upload → returns URL. |
| `thumbnailDpi` | `number` | `150` | A4-landscape thumbnail DPI. |
| `store` | `LayoutStore` | built-in REST | **Host injection** — swap in your own persistence (e.g. a CMS API). |
| `t` | `TranslateFn` | identity | **Host injection** — provide your own translator. |

### `FamilyChartEditor` props

| Prop | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Chart id to open. |
| `mode` | `'edit' \| 'view'` | Editable canvas or read-only viewer. |
| `onBack` | `() => void` | Close/return to list. |
| `onOpenView` / `onOpenEdit` | `(id) => void` | Navigation callbacks. |

## 🏗️ Layout modes

| Mode | 日本語 | Best for |
| --- | --- | --- |
| Tidy tree | 系図 | Classic pedigree / descent charts. |
| Timeline | 年表 | Lifespans & events along a time axis. |
| Force graph | 関係図 | Dense relationship networks. |
| Auto | 自動 | Let the chart pick a fit. |

Layout choice, spacing, grid, edge style, and relation filters are **persisted per chart** (the host app documents this in its own `docs/architecture/chart-viewsettings-persistence.md`).

## 🗂️ Data formats

- **CSV** — bulk people/relationships (incl. an image/video column): [`docs/csv-format.md`](docs/csv-format.md)
- **Chart JSON** — full chart payload shape: [`docs/chart-json-format.md`](docs/chart-json-format.md)
- **Import schema** — validation rules: [`docs/import-schema.md`](docs/import-schema.md)

## 🔌 Host integration

The library is **standalone by default** but every backend touch-point is an optional injection:

- `store` — replaces the built-in REST layer (map your API to `getPageList / getPageById / savePage / …`).
- `uploadFile` / `uploadThumbnail` — route media to your own object storage / CDN.
- `t` / `locale` — reuse the host's i18n.

This is how the chart embeds into the Ghost-based host app, persisting to a `social_charts` table and uploading thumbnails to S3. See [`docs/host-merge-plan.md`](docs/host-merge-plan.md).

## 🛠️ Development

```bash
yarn dev          # Vite dev server + json-server backend (:3195)
yarn build        # library build → dist/ (ES + UMD + d.ts + css)
yarn build:demo   # standalone demo build
yarn preview      # preview a build
yarn lint         # eslint
```

Build output (consumed via `package.json` `exports`):

```
dist/dynasty-history-chart.es.js    # ESM  (module)
dist/dynasty-history-chart.umd.js   # UMD  (main)
dist/index.d.ts                     # types
dist/family-chart.css               # styles  → import '@ghost-next/family-chart/style.css'
```

## 🧱 Tech stack

**React 18** · **D3 7** · **TypeScript 5** · **Vite** (library mode, `vite-plugin-dts`) · **TailwindCSS** · **Heroicons** · **uuid** · **axios**.

## 📚 Documentation

More design notes live in [`docs/`](docs/): agent/AI layout ([`docs/ai-layout-skill-prompt.md`](docs/ai-layout-skill-prompt.md)), chart-job pipeline ([`docs/chart-job-agent-plan.md`](docs/chart-job-agent-plan.md)), thumbnail generation ([`docs/thumbnail-generation.md`](docs/thumbnail-generation.md)), and the task log ([`docs/TASKS.md`](docs/TASKS.md)).

## 📄 License

Proprietary / internal — part of the Ghost-Next platform. No license is granted for external use unless one is added to this repository.
