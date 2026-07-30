# Plan: Merge family-history-chart into the ghost-next host

Integrate this family-chart library into the host app the way `stackpage` / `PersonGraph`
are integrated. **Editor-first**, then stackpage embedding. I implement the Ghost backend too.
Library source moves into the monorepo `packages/`.

## Repos involved

| Ref | Path | Role |
|---|---|---|
| Backend | `00-Ghost-5.116.2/ghost/core` | `social_charts` table + model + admin API |
| Frontend | `01-ghost-front/apps/host` | capabilities + `/api/social/*` routes + editor routes + data source |
| Package | `01-ghost-front/packages/family-chart` | the library (moved from here), host-adaptable |

## Confirmed patterns (from investigation)
- DB lives in Ghost backend (knex migrations `core/server/data/migrations/versions/<ver>/`).
- Frontend api routes → `services/ghost/*Capabilities.ts` (admin token) → Ghost.
- Saved "pages" (`pageLayoutStore.ts` → `/api/pages/[pageid]`) are the closest analog to a saved chart.
- Data sources = `HostFunctionDataSource` from `stackpage` (`fetchData` → `UniformHostDataSourceResponse`).
- i18n: `useT()` / `useTranslation()` (AppProvider), `t(key)`, default locale `ja`, dictionaries in `packages/i18n`.
- File upload: `@/utils/fileUploadService` (`createFileUploadHandler`) → our `DataProvider.uploadFile`.

---

## Phase 0 — Library → workspace package `packages/family-chart`
1. Move `12-family-history-chart/src/lib/**` into `01-ghost-front/packages/family-chart/src`.
   Keep the vite dual-mode build (mirror `packages/stackpage`: `dist/lib/*.es.js/.umd.js` + `index.css`, `exports` map, `.` + `./styles`).
2. Package name: `@ghost-next/family-chart` (or `family-chart`). Consumed via yalc/workspace like stackpage.
3. **Decouple from the built-in REST store** — `DataProvider` gains injectable props:
   - `store?: ChartStore` (list/get/save/insert/update/delete) — replaces internal `createLayoutStore`; keep the REST store as the default for standalone/demo.
   - `t?: (key: string) => string` and `locale?: string` — host i18n; fall back to a bundled ja/en dictionary.
   - `uploadFile?` (already exists).
4. Extract hardcoded EN/JP strings into keys (see Phase 4). Provide bundled defaults so the demo still runs.

## Phase 1 — Ghost backend: `social_charts` (00-Ghost-5.116.2)
First read how the fork added `person`/`estate` custom tables+endpoints and mirror them exactly.
1. **Migration** `core/server/data/migrations/versions/5.116/xxx-add-social-charts-table.js` — create table:
   `id` (char/objectid PK), `title`, `slug`, `image`, `owner_id`/`author_id`, `status` (draft/published),
   `chart_props` (longtext/json — persons/relationships/episodes/events/dynasties), `created_at`, `updated_at`.
2. **Schema** entry in `core/server/data/schema/schema.js`.
3. **Model** (bookshelf) `core/server/models/social-chart.js` + register.
4. **Admin API**: endpoint (browse/read/add/edit/destroy) mirroring the person/estate custom endpoints
   (controller + serializer + input/output + api/endpoints wiring + permissions/fixtures).

## Phase 2 — Frontend host: capabilities + api routes
1. `apps/host/src/services/ghost/socialChartsCapabilities.ts` — `browse/read/create/update/delete` via admin token (mirror `personGraphCapabilities.ts`).
2. `apps/host/src/app/api/social/charts/route.ts` (GET list, POST) + `.../charts/[id]/route.ts` (GET/PUT/DELETE) → capabilities (`source: "ghost-backend"`).
3. `apps/host/src/services/socialCharts/socialChartsApi.ts` — frontend fetch client → a `ChartStore` matching the library's injectable store.

## Phase 3 — Frontend host: editor routes (editor-first)
Mirror `app/pages/`:
1. `app/social-charts/list/page.tsx`, `.../edit/[id]/page.tsx`, `.../view/[id]/page.tsx` (+ layouts).
2. Each mounts `<DataProvider store={socialChartsStore} t={t} locale={locale} uploadFile={hostUpload}>` + the library's editor/list.
3. Wire `useT()`, locale, `createFileUploadHandler`, auth (`withAuth`) — copy the conventions from `pages/edit/[pageid]/page.tsx`.

## Phase 4 — i18n keys (packages/i18n)
1. Add a `familyChart` namespace (or extend `front`) for `ja` + `en`.
2. Replace library hardcoded strings with `t('familyChart.*')`; bundled defaults keep standalone working.

## Phase 5 — stackpage embedding (second)
1. `apps/host/src/hooks/SocialChartHostDataSource.service.ts` — chart list/detail as `HostFunctionDataSource`.
2. Register a family-chart **display** component in the stackpage component registry (`templates/registry/ComponentsProvider`) so charts embed inside built pages.

## Phase 6 — Verify
- Build `packages/family-chart`; `apps/host` dev up.
- CRUD a chart end-to-end → persists to Ghost `social_charts`.
- Locale switch (ja/en) updates labels via host `t`.
- Image upload uses host `fileUploadService`.
- (Phase 5) place a chart on a page via stackpage and view it.

## Open items to resolve during Phase 1
- Exact template for a custom Ghost table + admin endpoint in THIS fork (read the person/estate impl first).
- ID scheme (Ghost objectid vs our `name_shortid`) — map on save.
- Ownership/permissions model (per-user charts, draft/published, public view route).
