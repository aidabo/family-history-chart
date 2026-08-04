'use client'

import { useRef, useState } from 'react'
import { PersonNode } from '@/types/charts'
import { useDataContext } from '@/context/DataContext'

interface Props {
  node: PersonNode
  onChange: (updates: Partial<PersonNode>) => void
  onUpload?: (file: File) => Promise<string>
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function IdentitySection({ node, onChange, onUpload }: Props) {
  const { t } = useDataContext()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      // Host-provided upload service if available; otherwise embed as a data URL (base64)
      const url = onUpload ? await onUpload(file) : await readAsDataURL(file)
      onChange({ image: url })
    } catch {
      setError(t('Upload failed', 'アップロード失敗'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Name', 'Name')}</label>
        <input
          type="text"
          defaultValue={node.name}
          onBlur={(e) => onChange({ name: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Title', 'Title 肩書')}</label>
        <input
          type="text"
          defaultValue={node.title ?? ''}
          onBlur={(e) => onChange({ title: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Period', 'Period 期間（在位など・例 626-649）')}</label>
        <input
          type="text"
          defaultValue={node.period ?? ''}
          onBlur={(e) => onChange({ period: e.target.value })}
          placeholder={t('Period placeholder', '626-649 / 前221-前210')}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <p className="mt-0.5 text-[10px] text-gray-400">{t('Period hint', '表示は「肩書(期間)」。年表の基準に選べます（既定は生没年）。')}</p>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('Gender', 'Gender')}</label>
        <div className="flex gap-1">
          {(['male', 'female', 'other'] as const).map((g) => (
            <button
              key={g}
              onClick={() => onChange({ gender: g })}
              className={`flex-1 text-xs py-1 rounded border transition-colors ${
                node.gender === g
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {g === 'male' ? 'M' : g === 'female' ? 'F' : 'Other'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">{t('Birth', 'Birth')}</label>
          <input
            type="text"
            defaultValue={node.birth ?? ''}
            placeholder="e.g. 1920"
            onBlur={(e) => onChange({ birth: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">{t('Death', 'Death')}</label>
          <input
            type="text"
            defaultValue={node.death ?? ''}
            placeholder="e.g. 1990"
            onBlur={(e) => onChange({ death: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Image / Video', 'Image / Video')}</label>
        <div className="flex items-center gap-2">
          {node.image && (
            /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(node.image) ? (
              <video
                src={node.image}
                className="h-10 w-10 rounded object-cover border border-gray-200 shrink-0"
                muted autoPlay loop playsInline
              />
            ) : (
              <img
                src={node.image}
                alt=""
                className="h-10 w-10 rounded object-cover border border-gray-200 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )
          )}
          <input
            key={node.id + '_img'}
            type="text"
            defaultValue={node.image ?? ''}
            placeholder={t('Image URL placeholder', 'https://... または アップロード')}
            onBlur={(e) => onChange({ image: e.target.value })}
            className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="shrink-0 text-xs px-2 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-60"
            title={t('Upload image title', '画像ファイルをアップロード')}
          >
            {uploading ? '…' : t('Upload button', '⬆ Upload')}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
        </div>
        {node.image && (
          <button
            type="button"
            onClick={() => onChange({ image: '' })}
            className="mt-1 text-[11px] text-gray-400 hover:text-red-500"
          >
            {t('Remove image', '画像を削除')}
          </button>
        )}
        {error && <p className="text-[11px] text-red-500 mt-0.5">{error}</p>}
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Profile URL', 'Profile URL')}</label>
        <input
          type="text"
          defaultValue={node.profileUrl ?? ''}
          placeholder="https://..."
          onBlur={(e) => onChange({ profileUrl: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    </div>
  )
}
