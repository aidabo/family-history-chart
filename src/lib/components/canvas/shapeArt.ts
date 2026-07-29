// Decorative Japanese/historical node shapes (adapted from a DeepSeek-authored D3 board).
// Each shape is drawn on a rounded-rect "card" base at the node origin (0,0), sized from nodeSize.
import * as d3 from 'd3'

export const DECOR_SHAPES = [
  'kabuto', 'thinker', 'manga', 'flyer', 'scroll',
  'castle', 'crest', 'enso', 'compass', 'book',
] as const
export type DecorShape = typeof DECOR_SHAPES[number]

const DECOR_SET = new Set<string>(DECOR_SHAPES)
export const isDecorShape = (s?: string): s is DecorShape => !!s && DECOR_SET.has(s)

interface Theme { c1: string; c2: string; c3: string; bg: string; w: number; h: number; label: string; en: string }

const THEME: Record<DecorShape, Theme> = {
  kabuto:  { c1: '#3d1c02', c2: '#b8860b', c3: '#8b0000', bg: '#fdf5e6', w: 130, h: 140, label: '武将', en: 'Busho' },
  thinker: { c1: '#f5f0e8', c2: '#6b5b4f', c3: '#8b7355', bg: '#faf8f4', w: 120, h: 140, label: '思想家', en: 'Philosopher' },
  manga:   { c1: '#ffffff', c2: '#1a1a1a', c3: '#ff4444', bg: '#ffffff', w: 140, h: 130, label: '漫画', en: 'Manga' },
  flyer:   { c1: '#c41e3a', c2: '#fdf5e6', c3: '#1a1a1a', bg: '#fefaf2', w: 135, h: 150, label: 'チラシ', en: 'Flyer' },
  scroll:  { c1: '#deb887', c2: '#8b4513', c3: '#cd853f', bg: '#faf0dc', w: 160, h: 110, label: '巻物', en: 'Scroll' },
  castle:  { c1: '#2c2c2c', c2: '#f5f0e0', c3: '#4a4a4a', bg: '#e8e0d0', w: 120, h: 145, label: '城', en: 'Castle' },
  crest:   { c1: '#b8860b', c2: '#1a1a2e', c3: '#d4a745', bg: '#faf6ed', w: 115, h: 115, label: '家紋', en: 'Crest' },
  enso:    { c1: '#1a1a1a', c2: '#f5f0e6', c3: '#333333', bg: '#faf7f0', w: 120, h: 120, label: '禅円', en: 'Ensō' },
  compass: { c1: '#8b7355', c2: '#daa520', c3: '#5c4033', bg: '#fdf8f0', w: 125, h: 125, label: '羅針盤', en: 'Compass' },
  book:    { c1: '#1b315e', c2: '#c4a882', c3: '#2c4a7c', bg: '#f5efe4', w: 130, h: 105, label: '和本', en: 'Book' },
}

export function decorSize(type: DecorShape, nodeSize: number): { w: number; h: number } {
  const t = THEME[type]
  const k = nodeSize / 40
  return { w: t.w * k, h: t.h * k }
}

export function decorMeta(type: DecorShape) { return THEME[type] }

// Register the soft paper drop-shadow filters (once per <defs>).
export function ensureShapeArtDefs(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  if (!defs.select('#paperShadow').empty()) return
  const f = defs.append('filter').attr('id', 'paperShadow')
    .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%')
  f.append('feDropShadow').attr('dx', 2).attr('dy', 4).attr('stdDeviation', 5).attr('flood-color', '#000').attr('flood-opacity', 0.16)
  f.append('feDropShadow').attr('dx', 0).attr('dy', 1).attr('stdDeviation', 2).attr('flood-color', '#000').attr('flood-opacity', 0.08)
  const fs = defs.append('filter').attr('id', 'paperShadowStrong')
    .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%')
  fs.append('feDropShadow').attr('dx', 3).attr('dy', 6).attr('stdDeviation', 7).attr('flood-color', '#000').attr('flood-opacity', 0.22)
}

type G = d3.Selection<SVGGElement, unknown, null, undefined>

// ── Portrait frames for people ────────────────────────────────────────────────
// Circular portrait (image fills a circle of radius = nodeSize) with a themed
// ornamental frame drawn on top. Suited to different character types.
export const PORTRAIT_SHAPES = ['pGeneral', 'pNoble', 'pRoyal', 'pScholar', 'pMonk', 'pHero'] as const
export type PortraitShape = typeof PORTRAIT_SHAPES[number]
const PORTRAIT_SET = new Set<string>(PORTRAIT_SHAPES)
export const isPortraitShape = (s?: string): s is PortraitShape => !!s && PORTRAIT_SET.has(s)

interface PMeta { ring: string; accent: string; fill: string; label: string }
const PMETA: Record<PortraitShape, PMeta> = {
  pGeneral: { ring: '#1a1a1a', accent: '#b8860b', fill: '#3d1c02', label: '武将' },
  pNoble:   { ring: '#b5546a', accent: '#e8b3c0', fill: '#7c3a4a', label: '姫' },
  pRoyal:   { ring: '#b8860b', accent: '#daa520', fill: '#6b4f1a', label: '皇族' },
  pScholar: { ring: '#8b7355', accent: '#5c4033', fill: '#6b5b4f', label: '学者' },
  pMonk:    { ring: '#2a2a2a', accent: '#8b5a2b', fill: '#3a3a3a', label: '僧' },
  pHero:    { ring: '#111111', accent: '#e11d1d', fill: '#334155', label: '英雄' },
}
export const portraitMeta = (v: PortraitShape) => PMETA[v]

// A simple head+shoulders silhouette (fallback when no image is set).
export function drawPersonSilhouette(g: G, s: number, color: string) {
  g.append('circle').attr('r', s).attr('fill', '#f1ede6')
  g.append('circle').attr('cy', -s * 0.12).attr('r', s * 0.34).attr('fill', color)
  g.append('path')
    .attr('d', `M ${-s * 0.6} ${s * 0.75} Q ${-s * 0.55} ${s * 0.08} 0 ${s * 0.08} Q ${s * 0.55} ${s * 0.08} ${s * 0.6} ${s * 0.75} Z`)
    .attr('fill', color)
}

// Draw the ornamental frame (rings + top accent) on top of the portrait image.
export function drawPortraitFrame(g: G, variant: PortraitShape, s: number) {
  const k = s / 40
  const w = (n: number) => n * k
  const m = PMETA[variant]
  switch (variant) {
    case 'pGeneral': {
      g.append('circle').attr('r', s).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(6))
      g.append('circle').attr('r', s - w(4)).attr('fill', 'none').attr('stroke', m.accent).attr('stroke-width', w(2))
      g.append('path').attr('d', `M ${-s * 0.34} ${-s * 0.9} Q ${-s * 0.72} ${-s * 1.28} ${-s * 0.12} ${-s * 1.02}`).attr('fill', 'none').attr('stroke', m.accent).attr('stroke-width', w(5)).attr('stroke-linecap', 'round')
      g.append('path').attr('d', `M ${s * 0.34} ${-s * 0.9} Q ${s * 0.72} ${-s * 1.28} ${s * 0.12} ${-s * 1.02}`).attr('fill', 'none').attr('stroke', m.accent).attr('stroke-width', w(5)).attr('stroke-linecap', 'round')
      g.append('circle').attr('cy', -s * 0.98).attr('r', w(4.5)).attr('fill', '#8b0000').attr('stroke', m.accent).attr('stroke-width', w(1.5))
      break
    }
    case 'pNoble': {
      g.append('circle').attr('r', s).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(5))
      for (const a of [-32, 0, 32]) {
        const rad = (a - 90) * Math.PI / 180
        g.append('circle').attr('cx', Math.cos(rad) * s).attr('cy', Math.sin(rad) * s).attr('r', w(5.5)).attr('fill', m.accent).attr('stroke', m.ring).attr('stroke-width', w(1))
      }
      break
    }
    case 'pRoyal': {
      g.append('circle').attr('r', s).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(6))
      g.append('circle').attr('r', s - w(5)).attr('fill', 'none').attr('stroke', m.accent).attr('stroke-width', w(1.5))
      const cy = -s * 1.02
      for (let i = 0; i < 16; i++) {
        const rad = (i / 16) * Math.PI * 2
        g.append('line').attr('x1', Math.cos(rad) * w(3)).attr('y1', cy + Math.sin(rad) * w(3)).attr('x2', Math.cos(rad) * w(9)).attr('y2', cy + Math.sin(rad) * w(9)).attr('stroke', m.ring).attr('stroke-width', w(1.5))
      }
      g.append('circle').attr('cy', cy).attr('r', w(3)).attr('fill', m.ring)
      break
    }
    case 'pScholar': {
      g.append('circle').attr('r', s).attr('fill', 'none').attr('stroke', m.accent).attr('stroke-width', w(1.5))
      g.append('circle').attr('r', s - w(3)).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(4)).attr('stroke-dasharray', `${w(2)} ${w(3)}`)
      break
    }
    case 'pMonk': {
      const R = s, pts = 52
      const path: string[] = []
      for (let i = 0; i <= pts; i++) {
        const ang = (i / pts) * Math.PI * 2 - Math.PI / 2
        const wob = 1 + (Math.sin(i * 2.7) * 0.03 + Math.cos(i * 5.3) * 0.02)
        path.push(`${i === 0 ? 'M' : 'L'}${Math.cos(ang) * R * wob},${Math.sin(ang) * R * wob}`)
      }
      g.append('path').attr('d', path.join(' ')).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(5)).attr('stroke-linecap', 'round').attr('opacity', 0.85)
      break
    }
    case 'pHero': {
      for (let i = 0; i < 24; i++) {
        const rad = (i / 24) * Math.PI * 2
        const r1 = s + w(2), r2 = s + (i % 2 ? w(6) : w(12))
        g.append('line').attr('x1', Math.cos(rad) * r1).attr('y1', Math.sin(rad) * r1).attr('x2', Math.cos(rad) * r2).attr('y2', Math.sin(rad) * r2).attr('stroke', m.ring).attr('stroke-width', w(2))
      }
      g.append('circle').attr('r', s).attr('fill', 'none').attr('stroke', m.ring).attr('stroke-width', w(5))
      g.append('text').attr('x', 0).attr('y', -s * 1.02).attr('text-anchor', 'middle').attr('font-size', `${w(18)}px`).attr('fill', m.accent).text('★')
      break
    }
  }
}

// Draw the decorative artwork for `type` centered at (0,0), scaled from nodeSize.
export function drawShapeArt(g: G, type: DecorShape, nodeSize: number) {
  const t = THEME[type]
  const k = nodeSize / 40
  const w = t.w * k
  const h = t.h * k
  const c1 = t.c1, c2 = t.c2, c3 = t.c3, bg = t.bg
  const baseRx = 10 * k
  const fpx = (n: number) => `${n * k}px`

  switch (type) {
    case 'kabuto': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', '#c4a882').attr('stroke-width', 1.5).attr('filter', 'url(#paperShadow)')
      g.append('path').attr('d', `M${-w*0.30},${h*0.22} Q${-w*0.35},${-h*0.32} ${0},${-h*0.38} Q${w*0.35},${-h*0.32} ${w*0.30},${h*0.22} L${w*0.24},${h*0.30} Q${0},${h*0.42} ${-w*0.24},${h*0.30} Z`)
        .attr('fill', c1).attr('stroke', c2).attr('stroke-width', 2.5)
      g.append('path').attr('d', `M${-w*0.10},${-h*0.36} L${-w*0.28},${-h*0.45} Q${-w*0.20},${-h*0.22} ${-w*0.08},${-h*0.28} Z`).attr('fill', c2).attr('stroke', '#5c3a0a').attr('stroke-width', 1.5)
      g.append('path').attr('d', `M${w*0.10},${-h*0.36} L${w*0.28},${-h*0.45} Q${w*0.20},${-h*0.22} ${w*0.08},${-h*0.28} Z`).attr('fill', c2).attr('stroke', '#5c3a0a').attr('stroke-width', 1.5)
      g.append('circle').attr('cx', 0).attr('cy', -h * 0.28).attr('r', w * 0.07).attr('fill', c3).attr('stroke', c2).attr('stroke-width', 1.5)
      for (let i = -1; i <= 1; i += 2) {
        g.append('path').attr('d', `M${i*w*0.30},${h*0.10} L${i*w*0.38},${h*0.32} Q${i*w*0.30},${h*0.38} ${i*w*0.20},${h*0.32} Z`).attr('fill', c1).attr('stroke', c2).attr('stroke-width', 1.8)
      }
      break
    }
    case 'thinker': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', '#d5cdc0').attr('stroke-width', 1.5).attr('filter', 'url(#paperShadow)')
      g.append('ellipse').attr('cx', 5 * k).attr('cy', -5 * k).attr('rx', w * 0.38).attr('ry', h * 0.40).attr('fill', c1).attr('stroke', c3).attr('stroke-width', 2)
      g.append('path').attr('d', `M${-w*0.18},${h*0.30} L${-w*0.20},${h*0.05} Q${-w*0.25},${-h*0.15} ${-w*0.12},${-h*0.28} Q${-w*0.02},${-h*0.38} ${w*0.06},${-h*0.32} Q${w*0.18},${-h*0.22} ${w*0.22},${-h*0.08} L${w*0.24},${h*0.02} Q${w*0.20},${h*0.18} ${w*0.10},${h*0.28} L${-w*0.08},${h*0.32} Z`).attr('fill', c2).attr('stroke', c3).attr('stroke-width', 2)
      g.append('circle').attr('cx', w * 0.06).attr('cy', -h * 0.14).attr('r', 3 * k).attr('fill', '#faf8f4')
      g.append('path').attr('d', `M${w*0.04},${h*0.08} Q${w*0.14},${h*0.18} ${w*0.06},${h*0.28}`).attr('fill', 'none').attr('stroke', c3).attr('stroke-width', 2.5).attr('stroke-linecap', 'round')
      break
    }
    case 'manga': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', '#fefefe').attr('stroke', '#333').attr('stroke-width', 2).attr('filter', 'url(#paperShadowStrong)')
      const cyM = -h * 0.05
      for (let a = 0; a < 360; a += 18) {
        const rad = a * Math.PI / 180
        g.append('line').attr('x1', w * 0.18 * Math.cos(rad)).attr('y1', cyM + w * 0.18 * Math.sin(rad))
          .attr('x2', w * 0.55 * Math.cos(rad)).attr('y2', cyM + w * 0.55 * Math.sin(rad))
          .attr('stroke', '#222').attr('stroke-width', 1.3).attr('opacity', 0.55)
      }
      const rxB = w * 0.38, ryB = h * 0.32, nPts = 28
      const bubble: string[] = []
      for (let i = 0; i < nPts; i++) {
        const angle = (i / nPts) * Math.PI * 2
        const rr = i % 2 === 0 ? 1.08 : 0.92
        const px = rxB * Math.cos(angle) * rr
        const py = cyM + ryB * Math.sin(angle) * rr
        bubble.push(`${i === 0 ? 'M' : 'L'}${px},${py}`)
      }
      bubble.push('Z')
      g.append('path').attr('d', bubble.join(' ')).attr('fill', '#fff').attr('stroke', '#111').attr('stroke-width', 2.8)
      g.append('text').attr('x', 0).attr('y', cyM + h * 0.06).attr('text-anchor', 'middle')
        .attr('font-size', fpx(38)).attr('font-weight', 900).attr('fill', c3).attr('font-family', 'sans-serif').text('!')
      g.append('polygon').attr('points', `${w*0.15},${h*0.28} ${w*0.28},${h*0.40} ${w*0.05},${h*0.34}`).attr('fill', '#fff').attr('stroke', '#111').attr('stroke-width', 2)
      break
    }
    case 'flyer': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', 3).attr('ry', 3).attr('fill', c2).attr('stroke', c1).attr('stroke-width', 3).attr('filter', 'url(#paperShadow)')
      const im = 12 * k
      g.append('rect').attr('x', -w / 2 + im).attr('y', -h / 2 + im).attr('width', w - im * 2).attr('height', h - im * 2)
        .attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3').attr('rx', 2)
      const cm = im + 6 * k
      ;([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy]) => {
        g.append('path').attr('d', `M${sx*(w/2-cm)},${sy*(h/2-cm+16*k)} L${sx*(w/2-cm)},${sy*(h/2-cm)} L${sx*(w/2-cm+16*k)},${sy*(h/2-cm)}`)
          .attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 2.5).attr('stroke-linecap', 'round')
      })
      g.append('line').attr('x1', -w * 0.32).attr('y1', -h * 0.12).attr('x2', w * 0.32).attr('y2', -h * 0.12).attr('stroke', c1).attr('stroke-width', 2)
      g.append('line').attr('x1', -w * 0.32).attr('y1', h * 0.08).attr('x2', w * 0.32).attr('y2', h * 0.08).attr('stroke', c1).attr('stroke-width', 2)
      g.append('text').attr('x', 0).attr('y', h * 0.22).attr('text-anchor', 'middle').attr('font-size', fpx(28)).attr('fill', c1).text('★')
      g.append('text').attr('x', 0).attr('y', -h * 0.22).attr('text-anchor', 'middle').attr('font-size', fpx(11)).attr('font-weight', 700).attr('fill', c1).attr('letter-spacing', '3px').text('大特価')
      break
    }
    case 'scroll': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', c2).attr('stroke-width', 1.8).attr('filter', 'url(#paperShadow)')
      g.append('rect').attr('x', -w * 0.34).attr('y', -h * 0.25).attr('width', w * 0.68).attr('height', h * 0.50).attr('fill', '#fef9f0').attr('stroke', c2).attr('stroke-width', 1.2).attr('rx', 2)
      for (let sx = -1; sx <= 1; sx += 2) {
        g.append('rect').attr('x', sx * w * 0.38 - w * 0.06).attr('y', -h * 0.30).attr('width', w * 0.12).attr('height', h * 0.60).attr('fill', c2).attr('stroke', '#5c2d0a').attr('stroke-width', 1.5).attr('rx', 4)
        g.append('circle').attr('cx', sx * w * 0.38).attr('cy', -h * 0.30).attr('r', w * 0.06).attr('fill', c3).attr('stroke', '#5c2d0a').attr('stroke-width', 1.2)
        g.append('circle').attr('cx', sx * w * 0.38).attr('cy', h * 0.30).attr('r', w * 0.06).attr('fill', c3).attr('stroke', '#5c2d0a').attr('stroke-width', 1.2)
      }
      for (let i = 0; i < 4; i++) {
        g.append('line').attr('x1', -w * 0.22).attr('y1', -h * 0.08 + i * h * 0.09).attr('x2', w * 0.22).attr('y2', -h * 0.08 + i * h * 0.09).attr('stroke', '#b0a090').attr('stroke-width', 1).attr('opacity', 0.7)
      }
      break
    }
    case 'castle': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', '#8c7b6b').attr('stroke-width', 1.5).attr('filter', 'url(#paperShadow)')
      g.append('path').attr('d', `M${-w*0.30},${h*0.35} L${-w*0.30},${h*0.05} L${-w*0.20},${-h*0.15} L${-w*0.12},${-h*0.35} L${w*0.12},${-h*0.35} L${w*0.20},${-h*0.15} L${w*0.30},${h*0.05} L${w*0.30},${h*0.35} Z`).attr('fill', c1).attr('stroke', '#1a1a1a').attr('stroke-width', 2)
      g.append('path').attr('d', `M${-w*0.34},${-h*0.10} Q${-w*0.20},${-h*0.25} ${-w*0.10},${-h*0.34} Q${0},${-h*0.42} ${w*0.10},${-h*0.34} Q${w*0.20},${-h*0.25} ${w*0.34},${-h*0.10}`).attr('fill', c2).attr('stroke', '#1a1a1a').attr('stroke-width', 2)
      for (let wx = -0.1; wx <= 0.1; wx += 0.2) {
        g.append('rect').attr('x', wx * w - w * 0.06).attr('y', -h * 0.04).attr('width', w * 0.12).attr('height', h * 0.16).attr('fill', '#f5f0e0').attr('stroke', '#1a1a1a').attr('stroke-width', 1.2).attr('rx', 2)
      }
      for (let i = 0; i < 3; i++) {
        g.append('line').attr('x1', -w * 0.28).attr('y1', h * 0.15 + i * h * 0.08).attr('x2', w * 0.28).attr('y2', h * 0.15 + i * h * 0.08).attr('stroke', '#5a5045').attr('stroke-width', 1).attr('opacity', 0.6)
      }
      break
    }
    case 'crest': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', c1).attr('stroke-width', 2).attr('filter', 'url(#paperShadow)')
      g.append('circle').attr('r', w * 0.38).attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 3)
      g.append('circle').attr('r', w * 0.10).attr('fill', c2).attr('stroke', c1).attr('stroke-width', 2)
      for (let i = 0; i < 3; i++) {
        const ang = (i * 120 - 90) * Math.PI / 180
        const cx2 = w * 0.16 * Math.cos(ang), cy2 = w * 0.16 * Math.sin(ang)
        g.append('ellipse').attr('cx', cx2).attr('cy', cy2).attr('rx', w * 0.24).attr('ry', w * 0.24)
          .attr('fill', 'none').attr('stroke', c2).attr('stroke-width', 2.5).attr('transform', `rotate(${i*120}, ${cx2}, ${cy2})`)
      }
      for (let i = 0; i < 3; i++) {
        const ang = (i * 120 - 90) * Math.PI / 180
        g.append('circle').attr('cx', w * 0.30 * Math.cos(ang)).attr('cy', w * 0.30 * Math.sin(ang)).attr('r', w * 0.06).attr('fill', c3).attr('stroke', c1).attr('stroke-width', 1.5)
      }
      break
    }
    case 'enso': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', '#c4b9a8').attr('stroke-width', 1.2).attr('filter', 'url(#paperShadow)')
      const ensoR = w * 0.36, pts = 60
      const path: string[] = []
      for (let i = 0; i <= pts; i++) {
        const angle = (i / pts) * Math.PI * 2 - Math.PI / 2
        const wobble = 1 + (Math.sin(i * 2.7) * 0.04 + Math.cos(i * 5.3) * 0.03)
        const px = Math.cos(angle) * ensoR * wobble, py = Math.sin(angle) * ensoR * wobble
        path.push(`${i === 0 ? 'M' : 'L'}${px},${py}`)
      }
      g.append('path').attr('d', path.join(' ')).attr('fill', 'none').attr('stroke', c1).attr('stroke-width', 5 * k).attr('stroke-linecap', 'round').attr('opacity', 0.85)
      g.append('circle').attr('cx', 0).attr('cy', -ensoR).attr('r', 4.5 * k).attr('fill', c1).attr('opacity', 0.8)
      g.append('circle').attr('cx', w * 0.06).attr('cy', h * 0.04).attr('r', 2.5 * k).attr('fill', c3)
      break
    }
    case 'compass': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', c1).attr('stroke-width', 2).attr('filter', 'url(#paperShadow)')
      g.append('circle').attr('r', w * 0.42).attr('fill', '#fdf8f0').attr('stroke', c1).attr('stroke-width', 3)
      const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const
      dirs.forEach(([dx, dy], idx) => {
        const len = idx % 2 === 0 ? w * 0.36 : w * 0.20
        const px = dx * len, py = dy * len
        const perpX = -dy * w * 0.05, perpY = dx * w * 0.05
        g.append('polygon').attr('points', `0,0 ${px+perpX},${py+perpY} ${px-perpX},${py-perpY}`)
          .attr('fill', idx % 2 === 0 ? c2 : c1).attr('stroke', c3).attr('stroke-width', 1).attr('opacity', 0.75)
      })
      g.append('circle').attr('r', w * 0.08).attr('fill', c3).attr('stroke', c2).attr('stroke-width', 2)
      g.append('text').attr('x', 0).attr('y', -w * 0.40).attr('text-anchor', 'middle').attr('font-size', fpx(12)).attr('font-weight', 700).attr('fill', c3).text('N')
      break
    }
    case 'book': {
      g.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
        .attr('rx', baseRx).attr('ry', baseRx).attr('fill', bg).attr('stroke', c2).attr('stroke-width', 1.5).attr('filter', 'url(#paperShadow)')
      const bookColors = [c1, '#3a5a9c', '#1b315e']
      for (let i = 0; i < 3; i++) {
        const offsetY = -h * 0.08 + i * h * 0.18
        const bw = w * 0.60 - i * w * 0.04, bh = h * 0.22
        g.append('rect').attr('x', -bw / 2).attr('y', offsetY - bh / 2).attr('width', bw).attr('height', bh).attr('fill', bookColors[i]).attr('stroke', c2).attr('stroke-width', 1.5).attr('rx', 3)
        g.append('line').attr('x1', -bw * 0.25).attr('y1', offsetY - bh * 0.05).attr('x2', bw * 0.25).attr('y2', offsetY - bh * 0.05).attr('stroke', '#f5efe4').attr('stroke-width', 1).attr('opacity', 0.5)
      }
      g.append('line').attr('x1', -w * 0.20).attr('y1', -h * 0.25).attr('x2', -w * 0.20).attr('y2', h * 0.28).attr('stroke', c2).attr('stroke-width', 1.5).attr('stroke-dasharray', '3 4').attr('opacity', 0.7)
      g.append('line').attr('x1', w * 0.20).attr('y1', -h * 0.25).attr('x2', w * 0.20).attr('y2', h * 0.28).attr('stroke', c2).attr('stroke-width', 1.5).attr('stroke-dasharray', '3 4').attr('opacity', 0.7)
      break
    }
  }
}
