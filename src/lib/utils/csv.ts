// CSV import/export for the family chart. One row per person; parents/spouses are
// referenced by name (or ID). See docs/csv-format.md.
//
// parseCsvToGraph() returns { persons, relationships } in the same shape the JSON
// importer consumes (union nodes included), so both paths share the merge logic.

import type { PersonNode, Relationship } from '@/types/charts'

type Row = Record<string, string>

// Header aliases → canonical field key.
const HEADER_ALIASES: Record<string, string> = {
  '名前': 'name', 'name': 'name',
  '性別': 'gender', 'gender': 'gender', 'sex': 'gender',
  '生年': 'birth', '生年月日': 'birth', 'birth': 'birth', 'born': 'birth',
  '没年': 'death', '死亡': 'death', '死亡日': 'death', 'death': 'death', 'died': 'death',
  '父': 'father', '父親': 'father', 'father': 'father',
  '母': 'mother', '母親': 'mother', 'mother': 'mother',
  '配偶者': 'spouse', '結婚': 'spouse', 'spouse': 'spouse', 'partner': 'spouse',
  '養父': 'fatherFoster', 'fosterfather': 'fatherFoster', 'adoptivefather': 'fatherFoster',
  '養母': 'motherFoster', 'fostermother': 'motherFoster', 'adoptivemother': 'motherFoster',
  '義父': 'fatherStep', 'stepfather': 'fatherStep',
  '義母': 'motherStep', 'stepmother': 'motherStep',
  '肩書': 'title', '肩書き': 'title', '役職': 'title', 'title': 'title', 'role': 'title',
  'メモ': 'note', '説明': 'note', 'note': 'note', 'description': 'note',
  'id': 'id', 'ID': 'id',
}

const normGender = (v: string): PersonNode['gender'] | undefined => {
  const s = v.trim().toLowerCase()
  if (['男', 'male', 'm', '男性'].includes(v.trim()) || s === 'male' || s === 'm') return 'male'
  if (['女', 'female', 'f', '女性'].includes(v.trim()) || s === 'female' || s === 'f') return 'female'
  if (s) return 'other'
  return undefined
}

// Split a spouse/parent list by full/half-width semicolon or comma-in-cell.
const splitRefs = (v: string): string[] =>
  (v || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean)

// Minimal RFC-4180-ish CSV parser (quotes, embedded commas/newlines, CRLF, BOM).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* ignore, handled by \n */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export interface ParsedGraph {
  persons: Partial<PersonNode>[]
  relationships: Partial<Relationship>[]
}

export function parseCsvToGraph(text: string): ParsedGraph {
  const table = parseCsv(text)
  if (table.length < 2) return { persons: [], relationships: [] }

  const header = table[0].map((h) => HEADER_ALIASES[h.trim()] ?? h.trim())
  const rows: Row[] = table.slice(1).map((cells) => {
    const r: Row = {}
    header.forEach((key, i) => { r[key] = (cells[i] ?? '').trim() })
    return r
  })

  // Ref = the key used to link people: explicit ID if given, else the name.
  const refOf = (r: Row) => (r.id || r.name || '').trim()

  const persons = new Map<string, Partial<PersonNode>>()  // ref → person
  const ensure = (ref: string): Partial<PersonNode> | null => {
    const key = ref.trim()
    if (!key) return null
    let p = persons.get(key)
    if (!p) { p = { id: key, name: key }; persons.set(key, p) }
    return p
  }

  for (const r of rows) {
    const ref = refOf(r)
    if (!ref) continue
    const p = ensure(ref)!
    p.name = r.name || p.name || ref
    const g = normGender(r.gender || '')
    if (g) p.gender = g
    if (r.birth) p.birth = r.birth
    if (r.death) p.death = r.death
    if (r.title) p.title = r.title
    if (r.note) p.description = r.note
  }

  const relationships: Partial<Relationship>[] = []
  let unionSeq = 0
  const unionByPair = new Map<string, string>()      // "a|b" (sorted) → union id
  const marriedPairs = new Set<string>()             // pairs that are marriages
  const childrenByUnion = new Map<string, string[]>()// union id → child refs

  const pairKey = (a: string, b: string) => [a, b].sort().join('|')
  const getUnion = (a: string, b: string): string => {
    const key = pairKey(a, b)
    let uid = unionByPair.get(key)
    if (!uid) {
      uid = `u${++unionSeq}`
      unionByPair.set(key, uid)
      persons.set(uid, { id: uid, type: 'union', name: '', marriage: { type: 'marriage' } })
      relationships.push({ source: a, target: uid, type: 'partner' })
      relationships.push({ source: b, target: uid, type: 'partner' })
    }
    return uid
  }

  // First pass: register marriages (so a childless couple still forms a union).
  for (const r of rows) {
    const ref = refOf(r)
    if (!ref) continue
    for (const sp of splitRefs(r.spouse)) {
      const spRef = sp
      ensure(spRef)
      marriedPairs.add(pairKey(ref, spRef))
      getUnion(ref, spRef)
    }
  }

  // Second pass: parents / foster / step.
  for (const r of rows) {
    const childRef = refOf(r)
    if (!childRef) continue
    const father = r.father ? (ensure(r.father), r.father) : ''
    const mother = r.mother ? (ensure(r.mother), r.mother) : ''

    if (father && mother) {
      const uid = getUnion(father, mother)
      relationships.push({ source: uid, target: childRef, type: 'parent-child' })
      const arr = childrenByUnion.get(uid) ?? []; arr.push(childRef); childrenByUnion.set(uid, arr)
    } else if (father) {
      relationships.push({ source: father, target: childRef, type: 'parent-child' })
    } else if (mother) {
      relationships.push({ source: mother, target: childRef, type: 'parent-child' })
    }

    // Adopted (養子) and step (義理) parents → labelled parent-child edges.
    for (const f of [r.fatherFoster, r.motherFoster]) {
      if (f) { ensure(f); relationships.push({ source: f, target: childRef, type: 'parent-child', label: '養子' }) }
    }
    for (const f of [r.fatherStep, r.motherStep]) {
      if (f) { ensure(f); relationships.push({ source: f, target: childRef, type: 'parent-child', label: '義理' }) }
    }
  }

  return { persons: Array.from(persons.values()), relationships }
}

// ── Export ────────────────────────────────────────────────────────────────────

const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function graphToCsv(persons: PersonNode[], relationships: Relationship[]): string {
  const byId = new Map(persons.map((p) => [p.id, p]))
  const label = (p?: PersonNode) => (p ? (p.name || p.id) : '')

  // union id → the two partner ids
  const unionPartners = new Map<string, string[]>()
  for (const r of relationships) {
    if (r.type === 'partner') {
      const arr = unionPartners.get(r.target) ?? []; arr.push(r.source); unionPartners.set(r.target, arr)
    }
  }

  type Acc = { father: Set<string>; mother: Set<string>; spouse: Set<string>; foster: Set<string>; step: Set<string> }
  const acc = new Map<string, Acc>()
  const get = (id: string): Acc => {
    let a = acc.get(id); if (!a) { a = { father: new Set(), mother: new Set(), spouse: new Set(), foster: new Set(), step: new Set() }; acc.set(id, a) }
    return a
  }
  const addParent = (childId: string, parent?: PersonNode) => {
    if (!parent) return
    const a = get(childId)
    if (parent.gender === 'female') a.mother.add(label(parent))
    else a.father.add(label(parent))
  }

  for (const r of relationships) {
    if (r.type === 'parent-child') {
      const src = byId.get(r.source)
      const child = r.target
      if (src?.type === 'union') {
        for (const pid of unionPartners.get(src.id) ?? []) addParent(child, byId.get(pid))
      } else if (src) {
        if (r.label === '養子') get(child).foster.add(label(src))
        else if (r.label === '義理') get(child).step.add(label(src))
        else addParent(child, src)
      }
    } else if (r.type === 'marriage' || r.type === 'remarriage' || r.type === 'partner') {
      // marriage via union: partners of the same union are each other's spouses
      if (r.type === 'partner') continue // handled below
    }
  }
  // spouses from unions
  for (const [, partners] of unionPartners) {
    for (const a of partners) for (const b of partners) {
      if (a !== b) get(a).spouse.add(label(byId.get(b)))
    }
  }
  // direct marriage edges (no union)
  for (const r of relationships) {
    if (r.type === 'marriage' || r.type === 'remarriage') {
      const a = byId.get(r.source), b = byId.get(r.target)
      if (a && b) { get(a.id).spouse.add(label(b)); get(b.id).spouse.add(label(a)) }
    }
  }

  const headers = ['名前', '性別', '生年', '没年', '父', '母', '配偶者', '養父母', '義父母', '肩書', 'メモ']
  const genderJa = (g?: string) => g === 'male' ? '男' : g === 'female' ? '女' : g === 'other' ? 'その他' : ''
  const join = (s: Set<string>) => Array.from(s).filter(Boolean).join('；')

  const lines = [headers.join(',')]
  for (const p of persons) {
    if (p.type === 'union') continue
    const a = acc.get(p.id)
    lines.push([
      label(p), genderJa(p.gender), p.birth ?? '', p.death ?? '',
      join(a?.father ?? new Set()), join(a?.mother ?? new Set()), join(a?.spouse ?? new Set()),
      join(a?.foster ?? new Set()), join(a?.step ?? new Set()),
      p.title ?? '', p.description ?? '',
    ].map(csvCell).join(','))
  }
  return '﻿' + lines.join('\r\n')  // BOM for Excel
}
