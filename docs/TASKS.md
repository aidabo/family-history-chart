# Feature Task List

Tasks from user requests. Work through each until all ✅.

---

## ✅ DONE

- [x] CJK/Japanese/Chinese IME input fix in NodeCard (key={node.id})
- [x] Label font size / color / background shape / position controls
- [x] Font family selector (Japanese + Chinese historical/comic fonts — 18 fonts)
- [x] Node shape and label background shape are separate controls
- [x] Image persists when node shape changes (shape-specific clipPaths for all shapes)
- [x] Image rendering added to rect, diamond, hexagon, band, ellipse shapes
- [x] Title/description label freely draggable on canvas (D3 drag on name-label-g / desc-g)
- [x] Drag position saved (labelOffsetX/Y, descriptionOffsetX/Y) via onNodeUpdate callback
- [x] Reset drag button in AppearanceSection / DescriptionSection
- [x] Description background shape/color picker in DescriptionSection
- [x] Relation dialog draggable (header grip, can be moved anywhere on screen)
- [x] Remarriage (再婚) relation type added (type, color, dash pattern, edge label, badge)
- [x] Relation types consistent: RelationshipsSection TYPE_LABEL/BADGE updated to match dialog
- [x] Optional union node for any relation type (checkbox in dialog → ChartEditorPage creates partner links)
- [x] JSON import feature (Import button in toolbar, docs/import-schema.md schema)
- [x] PDF export (Print button → blob URL → new window → browser print dialog)

---

## ✅ DONE (session 2)

- [x] EdgeCard draggable (⠿ header, NodeCard drag pattern) + all 11 relation types
- [x] EdgeCard Line Width slider works (selectedRelationship synced in updateRelationship)
- [x] Edge click/drag no longer pans canvas (mousedown+pointerdown stopPropagation on link paths)
- [x] Ctrl+click node A then node B → relation dialog (d3 drag filter allows Ctrl; green dashed ring on source)
- [x] Relation dialog opens near the 2nd clicked node (initialX/initialY)
- [x] Marriage/remarriage default the union-node checkbox ON (children branch from union)
- [x] EdgeCard union checkbox → convert an existing direct edge into a union node + 2 partner links
- [x] Union creation is now explicit-only (removed marriage auto-union from DataContext)

## ✅ DONE (session 3 — union model)

- [x] Union is auxiliary: clicking a partner line OR the union● opens a dedicated UnionCard "A — B" (real partners), not a broken partner edge
- [x] UnionCard edits the real relationship (結婚/再婚 type, label, start/end) stored on the union node's marriage field
- [x] union● label shows 結婚/再婚 (from marriage.type)
- [x] "union解除" button: removes union + partner edges, restores a direct A—B edge, reconnects children to BOTH partners (dissolveUnion in DataContext)
- [x] "削除" button: removes union + all attached edges
- [x] marriage.type ('marriage'|'remarriage') stored on union so children clearly belong to the correct marriage (A-union-B children vs A-union2-M children)

---

## ✅ DONE (session 4 — upload / import / video / delete)

- [x] Esc closes any open card/dialog; Delete/Backspace deletes selected node or relationship (ignored while typing in inputs)
- [x] NodeCard 🗑 delete button in header
- [x] RelationshipsSection expands union-mediated relations (spouse/children/parents), no more empty-union entries
- [x] Image/Video upload button in IdentitySection — host `uploadImage(file)` callback if provided (DataProvider prop), else base64 data URL fallback
- [x] Video in nodes: circular avatars render `<video>` via SVG `<foreignObject>` (autoplay/muted/loop) when the URL is .mp4/.webm/.ogg/.mov
- [x] Import bug fixed: reads `chartProps.persons` (exported shape) AND flat `persons`; MERGES into current chart
- [x] Unique ids (Date.now()+counter) so bulk import doesn't collide; import remaps old id/name → new id
- [x] Multi-author merge workflow documented in docs/import-schema.md

## ✅ DONE (session 5 — shapes / group move / import placement)

- [x] Shift+drag moves the whole connected cluster (connectedComponent BFS; relative positions kept)
- [x] Import places new nodes to the RIGHT of existing ones (no overlap), preserving imported layout
- [x] ColorPicker white now visible (unselected swatches get a gray border); white/black selectable
- [x] Node size max doubled (80→160); label size max doubled earlier (24→48)
- [x] Name transparent background by default (halo for readability); Label Background opt-in band
- [x] Name centered on ALL shapes + Label Color + Bold toggle
- [x] Extra geometric shapes: star, shield, bubble, tag, seal
- [x] Collapsible Shape section (many shapes)
- [x] 10 decorative Japanese/historical card shapes (shapeArt.ts): 武将/思想家/漫画風/チラシ風/巻物/城/家紋/禅円/羅針盤/和本 — name drawn below the card

## 📋 BACKLOG

- [ ] Decorative shapes ignore profile image (they are drawn icons) — could optionally embed image
- [ ] Video support for non-circle shapes (currently circle only)
- [ ] Large base64 media bloats saved db.json — prefer host uploadFile in production

- [ ] More Chinese free fonts (additional suggestions beyond current 6 Chinese fonts)
- [ ] Export chart as SVG/PNG image (separate from PDF print flow)
