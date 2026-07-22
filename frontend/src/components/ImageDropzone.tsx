import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  multiple?: boolean
  accept?: string
  label?: string
  disabled?: boolean
}

export function ImageDropzone({
  onFiles,
  multiple = false,
  accept = 'image/jpeg,image/png,image/webp,image/bmp',
  label = 'Drop images here or click to browse',
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'))
    if (files.length) onFiles(multiple ? files : [files[0]])
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    take(e.dataTransfer.files)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    take(e.target.files)
    e.target.value = ''
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition
        ${dragging ? 'border-accent bg-accent-soft/60' : 'border-line bg-panel hover:border-accent/50'}
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs text-ink-muted">JPEG, PNG, WebP · face clearly visible</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onChange}
      />
    </button>
  )
}
