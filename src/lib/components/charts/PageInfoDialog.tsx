import { useState, useRef, ChangeEvent, useEffect } from 'react'

type PageInfoDialogProps = {
  open: boolean
  onClose: () => void
  onSubmit: (data: { title: string; image: string; status: 'published' | 'draft'; category: string }) => void
  initialData?: { title: string; image: string; status?: 'published' | 'draft'; category?: string }
  onImageUpload?: (file: File) => Promise<string>
}

export function PageInfoDialog({
  open,
  onClose,
  onSubmit,
  initialData = { title: '', image: '', status: 'draft', category: '' },
  onImageUpload,
}: PageInfoDialogProps) {
  const [title, setTitle] = useState(initialData.title)
  const [image, setImage] = useState(initialData.image)
  const [status, setStatus] = useState<'published' | 'draft'>(initialData.status ?? 'draft')
  const [category, setCategory] = useState(initialData.category ?? '')
  const [errors, setErrors] = useState({ title: '', image: '' })
  const [isUploading, setIsUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(initialData.title)
    setImage(initialData.image)
    setStatus(initialData.status ?? 'draft')
    setCategory(initialData.category ?? '')
    setPreviewImage(null)
    setUploadedImage(null)
    setErrors({ title: '', image: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const validate = () => {
    const errs = { title: '', image: '' }
    let ok = true
    if (!title.trim()) { errs.title = 'Title is required'; ok = false }
    if (image && !/^(https?:\/\/|data:image\/)/.test(image)) {
      errs.image = 'Please provide a valid image URL or upload an image'; ok = false
    }
    setErrors(errs)
    return ok
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    let finalImage = image
    if (uploadedImage && !onImageUpload) finalImage = await fileToBase64(uploadedImage)
    onSubmit({ title, image: finalImage, status, category })
    reset()
  }

  const reset = () => {
    setTitle(''); setImage(''); setStatus('draft'); setCategory('')
    setPreviewImage(null); setUploadedImage(null)
    setErrors({ title: '', image: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedImage(file)
    const dataUrl = await fileToBase64(file)
    setPreviewImage(dataUrl)
    if (onImageUpload) {
      setIsUploading(true)
      try { setImage(await onImageUpload(file)) }
      catch { setErrors((prev) => ({ ...prev, image: 'Upload failed' })) }
      finally { setIsUploading(false) }
    } else {
      setImage('')
    }
  }

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.readAsDataURL(file)
      r.onload = () => resolve(r.result as string)
      r.onerror = reject
    })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {initialData.title ? 'Edit Page' : 'Create New Page'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
              <input
                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-blue-500 ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Enter page title"
              />
              {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'published' | 'draft')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                placeholder="e.g. Dynasty, Imperial, Modern"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Image</label>
              <div className="flex gap-2">
                <input
                  type="text" value={image} onChange={(e) => setImage(e.target.value)}
                  className={`flex-grow px-3 py-2 border rounded-md focus:outline-none ${errors.image ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="Image URL or upload file"
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 disabled:opacity-50">
                  {isUploading ? 'Uploading…' : 'Upload'}
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>
              {errors.image && <p className="mt-1 text-sm text-red-600">{errors.image}</p>}
              {(previewImage || image) && (
                <div className="mt-3 flex flex-col items-center">
                  <img src={previewImage || image} alt="Preview"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      img.onerror = null // no external asset, no retry loop
                      img.style.display = 'none'
                    }}
                  />
                  <button type="button" onClick={() => { setImage(''); setPreviewImage(null); setUploadedImage(null) }}
                    className="mt-1 text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { reset(); onClose() }}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={isUploading}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                {initialData.title ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
