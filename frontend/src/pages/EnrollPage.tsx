import { useEffect, useState } from 'react'
import { enrollPerson, errMessage, previewFace } from '../api'
import { FaceOverlay } from '../components/FaceOverlay'
import { ImageDropzone } from '../components/ImageDropzone'
import { WebcamCapture } from '../components/WebcamCapture'
import type { FaceBox } from '../types'

interface PreviewItem {
  file: File
  url: string
  faces: FaceBox[]
  imageSize: { width: number; height: number } | null
  hasFace: boolean | null
  checking: boolean
}

export function EnrollPage() {
  const [name, setName] = useState('')
  const [items, setItems] = useState<PreviewItem[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  )

  useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = async (files: File[]) => {
    setMessage(null)
    const next: PreviewItem[] = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      faces: [],
      imageSize: null,
      hasFace: null,
      checking: true,
    }))
    setItems((prev) => [...prev, ...next])

    for (let i = 0; i < next.length; i++) {
      const item = next[i]
      try {
        const preview = await previewFace(item.file)
        setItems((prev) =>
          prev.map((p) =>
            p.url === item.url
              ? {
                  ...p,
                  faces: preview.faces,
                  imageSize: preview.image_size,
                  hasFace: preview.has_face,
                  checking: false,
                }
              : p,
          ),
        )
      } catch {
        setItems((prev) =>
          prev.map((p) =>
            p.url === item.url
              ? { ...p, hasFace: false, checking: false }
              : p,
          ),
        )
      }
    }
  }

  const removeItem = (url: string) => {
    setItems((prev) => {
      const found = prev.find((p) => p.url === url)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((p) => p.url !== url)
    })
  }

  const submit = async () => {
    setMessage(null)
    if (!name.trim()) {
      setMessage({ type: 'err', text: 'Enter a person name' })
      return
    }
    if (items.length === 0) {
      setMessage({ type: 'err', text: 'Add at least one face image' })
      return
    }
    setBusy(true)
    try {
      const result = await enrollPerson(
        name.trim(),
        items.map((i) => i.file),
      )
      const warn =
        result.warnings?.length > 0
          ? ` Warnings: ${result.warnings.join('; ')}`
          : ''
      setMessage({
        type: 'ok',
        text: `Enrolled ${result.name}: +${result.samples_added} sample(s), ${result.total_samples} total.${warn}`,
      })
      items.forEach((i) => URL.revokeObjectURL(i.url))
      setItems([])
      setName('')
    } catch (err) {
      setMessage({ type: 'err', text: errMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-ink">Enroll identity</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload one or more clear face photos. MTCNN aligns each face; FaceNet
            stores L2-normalized 512-D embeddings. Existing people get new samples
            appended.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Person name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none ring-accent/30 focus:ring-2"
          />
        </label>

        <ImageDropzone onFiles={addFiles} multiple disabled={busy} />

        <div className="flex flex-wrap items-center gap-3">
          <WebcamCapture onCapture={(f) => addFiles([f])} disabled={busy} />
          <button
            type="button"
            disabled={busy || items.length === 0}
            onClick={submit}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50"
          >
            {busy ? 'Enrolling…' : `Enroll ${items.length || ''} sample${items.length === 1 ? '' : 's'}`}
          </button>
        </div>

        {message && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              message.type === 'ok'
                ? 'bg-accent-soft text-accent-dark'
                : 'bg-danger-soft text-danger'
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted uppercase tracking-wide">
          Face preview
        </h3>
        {items.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-line bg-panel text-sm text-ink-muted">
            Previews with detection boxes appear here
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div key={item.url} className="relative">
                <FaceOverlay
                  src={item.url}
                  faces={item.faces}
                  primaryBox={item.faces[0]?.box}
                  imageSize={item.imageSize ?? undefined}
                  maxHeight={280}
                  label={
                    item.checking
                      ? 'Detecting…'
                      : item.hasFace
                        ? 'Face OK'
                        : 'No face'
                  }
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-ink-muted">{item.file.name}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.url)}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
