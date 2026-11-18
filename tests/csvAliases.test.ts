import { describe, it, expect } from 'vitest'
import { parseCsvToGraph } from '../src/lib/utils/csv'

// CSV 取り込みの別名（朝代更替 / 换代）が、表示側と同じ一覧から
// 「custom + 朝代更换」の関係になることを確かめる（edgeStyle と csv の共有）。
describe('CSV の朝代更换の別名', () => {
  for (const col of ['朝代更换', '朝代更替', '换代']) {
    it(`見出し「${col}」で custom/朝代更换 の関係ができる`, () => {
      const csv = ['名前,生年,没年,' + col, '甲,1500,1550,', '乙,1550,1600,甲'].join('\n')
      const { persons, relationships } = parseCsvToGraph(csv)
      expect(persons.length).toBe(2)
      const edge = relationships.find(r => r.type === 'custom' && r.label === '朝代更换')
      expect(edge).toBeTruthy()
      const nameOf = (id: string) => persons.find(p => p.id === id)?.name
      expect(nameOf(edge!.source!)).toBe('甲')
      expect(nameOf(edge!.target!)).toBe('乙')
    })
  }
})
