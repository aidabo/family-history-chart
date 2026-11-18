import { describe, it, expect } from 'vitest'
import { DYNASTY_CHANGE_COLOR, isDynastyChange, edgeWidth } from '../src/lib/utils/edgeStyle'

describe('isDynastyChange', () => {
  it('custom + 朝代更换（と別名）は true', () => {
    for (const label of ['朝代更换', '朝代更替', '换代']) {
      expect(isDynastyChange({ type: 'custom', label })).toBe(true)
    }
  })
  it('ほかの custom ラベル・別の種類は false', () => {
    expect(isDynastyChange({ type: 'custom', label: '師' })).toBe(false)
    expect(isDynastyChange({ type: 'succession' })).toBe(false)
    expect(isDynastyChange({ type: 'custom' })).toBe(false)
    expect(isDynastyChange({ label: '朝代更换' })).toBe(false)   // custom でない
  })
})

describe('edgeWidth', () => {
  it('朝代更换は 3px（ホバーを外しても同じ式で戻る）', () => {
    expect(edgeWidth({ type: 'custom', label: '朝代更换' })).toBe(3)
  })
  it('通常は 2px、兄弟は 1.5px', () => {
    expect(edgeWidth({ type: 'succession' })).toBe(2)
    expect(edgeWidth({ type: 'sibling' })).toBe(1.5)
  })
  it('関係ごとの width が最優先', () => {
    expect(edgeWidth({ type: 'custom', label: '朝代更换', width: 5 })).toBe(5)
  })
  it('色は継承の緑と別（オレンジ）', () => {
    expect(DYNASTY_CHANGE_COLOR).toBe('#ea580c')
  })
})
