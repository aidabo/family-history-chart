# JSON Import Schema

Import JSON to add persons and relationships to a chart. Partial data is OK — only `name` is required for each person.

## File format

```json
{
  "persons": [ ...PersonEntry ],
  "relationships": [ ...RelationshipEntry ]
}
```

Both keys are optional. You can import persons only, or relationships only (if IDs already exist in the chart).

**The exported page file is also accepted directly** — if the JSON has a `chartProps` wrapper, `persons`/`relationships` are read from inside it:

```json
{ "chartProps": { "persons": [ ... ], "relationships": [ ... ] } }
```

## Merge behavior (multi-author workflow)

Import **merges** into the current chart — it never clears existing data. This supports splitting a large chart/timeline across several people who each build a part, then combining:

1. Each author builds their own chart and Exports a JSON file.
2. One person Imports the others' files one by one — all persons/relationships are appended.
3. Every imported person gets a **fresh unique id**; incoming `id`/`name` are remapped so each file's internal relationships stay intact even if two files reused the same id.
4. Connect the merged groups on-screen with **Ctrl+click A → B** (or a port drag) to add the cross-group relationships.

---

## PersonEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name |
| `id` | string | — | If omitted, auto-generated. Use to reference in relationships. |
| `title` | string | — | Title / role (e.g. 将軍, Emperor) |
| `gender` | `"male"` \| `"female"` \| `"other"` | — | Affects default node color |
| `birth` | string | — | Birth year or date (e.g. `"1800"`, `"1800-03-15"`) |
| `death` | string | — | Death year or date |
| `age` | string | — | Shown if birth/death not set |
| `description` | string | — | Description text shown near node |
| `image` | string | — | Image URL or `data:image/...` base64 |
| `profileUrl` | string | — | URL opened when clicking name |
| `shape` | `"circle"` \| `"rect"` \| `"diamond"` \| `"hexagon"` \| `"band"` \| `"ellipse"` | — | Node shape (default: `"circle"`) |
| `nodeSize` | number | — | Radius / half-height in pixels (default: 40) |
| `bgColor` | string | — | Node fill color (CSS color) |
| `borderColor` | string | — | Node border color |
| `labelColor` | string | — | Label text color |
| `labelFontSize` | number | — | Label font size in px |
| `fontFamily` | string | — | CSS font-family string |
| `x` | number | — | Initial X position on canvas |
| `y` | number | — | Initial Y position on canvas |

### Example

```json
{
  "persons": [
    { "id": "p1", "name": "徳川家康", "title": "征夷大将軍", "birth": "1543", "death": "1616", "gender": "male" },
    { "id": "p2", "name": "徳川秀忠", "birth": "1579", "death": "1632", "gender": "male" },
    { "id": "p3", "name": "お市の方",  "birth": "1547", "death": "1583", "gender": "female" }
  ]
}
```

---

## RelationshipEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | ✅ | Person `id` or `name` |
| `target` | string | ✅ | Person `id` or `name` |
| `type` | string | ✅ | See types below |
| `label` | string | — | Custom label shown on edge |
| `start` | string | — | Start year (for marriage etc.) |
| `end` | string | — | End year |
| `color` | string | — | Edge color (CSS color) |
| `width` | number | — | Edge line width in px |

### Relationship types

| type | Display | Description |
|------|---------|-------------|
| `parent-child` | 親子 | source is parent of target |
| `marriage` | 結婚 | Marriage |
| `remarriage` | 再婚 | Remarriage |
| `sibling` | 兄弟 | Siblings |
| `succession` | 継承 | Succession / inheritance |
| `ally` | 同盟 | Alliance |
| `rival` | 対立 | Rivalry |
| `mentor` | 師弟 | Mentor–disciple |
| `enemy` | 敵対 | Enemies |
| `friend` | 親友 | Friends |
| `custom` | Custom | Custom (use `label` for description) |

### Example

```json
{
  "relationships": [
    { "source": "p1", "target": "p2", "type": "parent-child" },
    { "source": "p1", "target": "p3", "type": "marriage", "start": "1566", "end": "1583" }
  ]
}
```

---

## Full example

Save as `my-family.json` and import via the toolbar Import button.

```json
{
  "persons": [
    { "id": "toku1", "name": "徳川家康", "title": "初代将軍", "birth": "1543", "death": "1616", "gender": "male", "shape": "circle" },
    { "id": "toku2", "name": "徳川秀忠", "title": "二代将軍", "birth": "1579", "death": "1632", "gender": "male" },
    { "id": "toku3", "name": "徳川家光", "title": "三代将軍", "birth": "1604", "death": "1651", "gender": "male" }
  ],
  "relationships": [
    { "source": "toku1", "target": "toku2", "type": "parent-child" },
    { "source": "toku2", "target": "toku3", "type": "parent-child" },
    { "source": "toku1", "target": "toku2", "type": "succession" }
  ]
}
```
