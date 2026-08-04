import { useEffect, useRef, useState } from 'react'
import ColorPickerPopover from '@/components/ui/ColorPickerPopover'
import { ShapePicker } from '@/components/ui/ShapePicker'
import { VerticalTextMode } from '@/types/charts'
import { useDataContext } from '@/context/DataContext'

interface ChartSettingsDialogProps {
  open: boolean
  onClose: () => void
  background?: string
  onBackgroundChange: (bg: string) => void
  backgroundImage?: string
  onBackgroundImageChange: (url: string) => void
  backgroundOpacity: number
  onBackgroundOpacityChange: (n: number) => void
  uploadFile?: (file: File) => Promise<string>
  verticalText: VerticalTextMode
  onVerticalTextChange: (m: VerticalTextMode) => void
  dpi: number
  onDpiChange: (dpi: number) => void
  zoom: number
  onZoomChange: (k: number) => void
  onFit: () => void
}

export default function ChartSettingsDialog({
  open,
  onClose,
  background,
  onBackgroundChange,
  backgroundImage,
  onBackgroundImageChange,
  backgroundOpacity,
  onBackgroundOpacityChange,
  uploadFile,
  verticalText,
  onVerticalTextChange,
  dpi,
  onDpiChange,
  zoom,
  onZoomChange,
  onFit,
}: ChartSettingsDialogProps) {
  const { t, updateAllPersons } = useDataContext()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  // Chart-wide shape / node size — same controls as a single node's Appearance, but each
  // change applies to EVERY node at once (overwriting per-node values). No single "current"
  // value exists across mixed nodes, so these start at the defaults and act as "set all to".
  const [gShape, setGShape] = useState<string>('circle')
  const [gSize, setGSize] = useState(30)
  const [gBandW, setGBandW] = useState(200)
  const [gBandH, setGBandH] = useState(40)
  const gIsBand = gShape === 'band'

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setUploadErr(null)
    if (!uploadFile) {
      // Standalone / no host uploader: fall back to an inline data-URI.
      const reader = new FileReader()
      reader.onload = () => onBackgroundImageChange(String(reader.result))
      reader.readAsDataURL(file)
      return
    }
    try {
      setUploading(true)
      const url = await uploadFile(file)
      if (url) onBackgroundImageChange(url)
    } catch (err) {
      setUploadErr(t('Background image upload failed','アップロードに失敗しました'))
      console.error('background image upload error:', err)
    } finally {
      setUploading(false)
    }
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-96 max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('Settings','設定')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-xl"
            aria-label={t('Close','Close')}
          >
            ×
          </button>
        </div>

        {/* ① 背景 */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('Background section','① 背景')}</h3>

          {/* 背景色 */}
          <p className="text-xs text-gray-500 mb-1">{t('Background color','背景色')}</p>
          {/* Inline — not floating; ColorPickerPopover without onClose so it stays open */}
          <ColorPickerPopover
            value={background}
            onChange={onBackgroundChange}
          />

          {/* 背景画像 */}
          <p className="text-xs text-gray-500 mt-4 mb-1">{t('Background image','背景画像')}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={backgroundImage ?? ''}
              onChange={(e) => onBackgroundImageChange(e.target.value)}
              placeholder={t('Image URL or upload','画像URL または アップロード')}
              className="flex-1 min-w-0 rounded border border-gray-300 text-sm px-2 py-1"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 px-2 py-1 text-sm rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-60"
            >
              {uploading ? '...' : t('Upload file','アップロード')}
            </button>
            {backgroundImage && (
              <button
                type="button"
                onClick={() => onBackgroundImageChange('')}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t('Remove background image','Remove background image')}
              >
                ×
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePickFile}
            />
          </div>
          {uploadErr && <p className="text-xs text-red-500 mt-1">{uploadErr}</p>}
          {backgroundImage && (
            <div
              className="mt-2 h-16 w-full rounded border border-gray-200 bg-gray-100"
              style={{
                backgroundImage: `url("${backgroundImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: backgroundOpacity,
              }}
            />
          )}

          {/* 不透明度 */}
          <p className="text-xs text-gray-500 mt-4 mb-1">{t('Opacity (background color / image)','不透明度（背景色・画像に適用）')}</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={backgroundOpacity}
              onChange={(e) => onBackgroundOpacityChange(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm font-mono w-10 text-right text-gray-700">
              {Math.round(backgroundOpacity * 100)}%
            </span>
          </div>
        </section>

        {/* ② DPI */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('DPI section','② DPI（サムネイル・印刷解像度）')}</h3>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={72}
              max={300}
              step={6}
              value={dpi}
              onChange={(e) => onDpiChange(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm font-mono w-12 text-right text-gray-700">{dpi} dpi</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('DPI description','値が大きいほどサムネイルと印刷が鮮明になります（150 dpi = A4景観 1754×1240px）。')}
          </p>
        </section>

        {/* ③ ビューポート */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Viewport section','③ ビューポート')}</h3>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-gray-600 w-14 shrink-0">{zoom.toFixed(2)}×</span>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onFit}
            className="w-full py-2 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors"
          >
            {t('Fit to content','全体にフィット')}
          </button>
        </section>

        {/* ④ 縦書き */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Vertical text section','④ 縦書き（縦書き）')}</h3>
          <div className="flex flex-col gap-1.5">
            {([
              ['off', t('Horizontal writing (default)','横書き（既定）')],
              ['cjk', t('Vertical writing: CJK auto','縦書き：日本語・中国語のみ自動')],
              ['on', t('Vertical writing: all','縦書き：すべて')],
            ] as [VerticalTextMode, string][]).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="verticalText"
                  checked={verticalText === val}
                  onChange={() => onVerticalTextChange(val)}
                  className="accent-blue-600"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t('Vertical text note','name・title・説明に適用。ノード個別に上書きも可能です（各人物の Appearance）。')}
          </p>
        </section>

        {/* ⑤ ノード（シェイプ・サイズ）— same controls as a single node's Appearance, applied
            to EVERY node at once. Handy for restyling the whole chart in one go. */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Node style section','⑤ ノード（全体のシェイプ・サイズ）')}</h3>
          <p className="text-xs text-gray-500 mb-2">{t('Apply to all nodes note','選択すると全ノードへ一括適用します（各ノードの個別設定は上書きされます）。')}</p>
          <ShapePicker value={gShape} onChange={(shape) => { setGShape(shape); updateAllPersons({ shape }) }} />
          {gIsBand ? (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">{t('Band Width','Band Width')}: {gBandW}px</label>
                <input type="range" min={50} max={400} value={gBandW}
                  onChange={(e) => setGBandW(Number(e.target.value))}
                  onMouseUp={(e) => updateAllPersons({ bandWidth: Number((e.currentTarget as HTMLInputElement).value) })}
                  onTouchEnd={(e) => updateAllPersons({ bandWidth: Number((e.currentTarget as HTMLInputElement).value) })}
                  className="w-full accent-blue-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">{t('Band Height','Band Height')}: {gBandH}px</label>
                <input type="range" min={20} max={80} value={gBandH}
                  onChange={(e) => setGBandH(Number(e.target.value))}
                  onMouseUp={(e) => updateAllPersons({ bandHeight: Number((e.currentTarget as HTMLInputElement).value) })}
                  onTouchEnd={(e) => updateAllPersons({ bandHeight: Number((e.currentTarget as HTMLInputElement).value) })}
                  className="w-full accent-blue-600" />
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-0.5">{t('Node Size','Node Size')}: {gSize}px</label>
              <input type="range" min={10} max={160} value={gSize}
                onChange={(e) => setGSize(Number(e.target.value))}
                onMouseUp={(e) => updateAllPersons({ nodeSize: Number((e.currentTarget as HTMLInputElement).value) })}
                onTouchEnd={(e) => updateAllPersons({ nodeSize: Number((e.currentTarget as HTMLInputElement).value) })}
                className="w-full accent-blue-600" />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
