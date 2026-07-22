import { useEffect, useState } from 'react'
import { errMessage, recognizeFace } from '../api'
import { FaceOverlay } from '../components/FaceOverlay'
import { ImageDropzone } from '../components/ImageDropzone'
import { WebcamCapture } from '../components/WebcamCapture'
import type { RecognizeResult } from '../types'

export function RecognizePage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RecognizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const setImage = (f: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
    setFile(f)
    setResult(null)
    setError(null)
  }

  const run = async (f?: File) => {
    const target = f ?? file
    if (!target) {
      setError('Choose or capture an image first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await recognizeFace(target)
      setResult(res)
    } catch (err) {
      setResult(null)
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (files: File[]) => {
    const f = files[0]
    setImage(f)
    await run(f)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-ink">Recognize face</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Upload or capture a face. The largest detected face is embedded and
            matched with cosine similarity against enrolled identities.
          </p>
        </div>

        <ImageDropzone
          onFiles={onFiles}
          multiple={false}
          disabled={busy}
          label="Drop a face image to classify"
        />

        <div className="flex flex-wrap items-center gap-3">
          <WebcamCapture
            disabled={busy}
            onCapture={async (f) => {
              setImage(f)
              await run(f)
            }}
          />
          <button
            type="button"
            disabled={busy || !file}
            onClick={() => run()}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {busy ? 'Matching…' : 'Recognize again'}
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {previewUrl && (
          <FaceOverlay
            src={previewUrl}
            faces={result?.all_faces}
            primaryBox={result?.face_box}
            imageSize={result?.image_size}
            maxHeight={640}
            label={
              result
                ? `${result.matched_name} · ${(result.confidence * 100).toFixed(1)}%`
                : busy
                  ? 'Analyzing…'
                  : undefined
            }
          />
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Result
          </h3>
          {!result && !busy && (
            <p className="mt-4 text-sm text-ink-muted">
              No classification yet. Upload an image to begin.
            </p>
          )}
          {busy && (
            <p className="mt-4 text-sm text-ink-muted animate-pulse">
              Running MTCNN → FaceNet → similarity…
            </p>
          )}
          {result && (
            <div className="mt-4 space-y-4">
              <div>
                <p
                  className={`text-3xl font-semibold tracking-tight ${
                    result.is_match ? 'text-accent-dark' : 'text-ink-muted'
                  }`}
                >
                  {result.matched_name}
                </p>
                <p className="mt-1 font-mono text-sm text-ink-muted">
                  confidence {(result.confidence * 100).toFixed(2)}%
                  {!result.is_match && (
                    <span className="ml-2 text-warn">
                      below threshold {(result.threshold * 100).toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full transition-all ${
                    result.is_match ? 'bg-accent' : 'bg-warn'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, result.confidence * 100))}%`,
                  }}
                />
              </div>

              <p className="text-xs text-ink-muted">
                {result.faces_detected} face
                {result.faces_detected === 1 ? '' : 's'} detected · primary face
                used for matching
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Top-3 candidates
          </h3>
          {!result?.top3?.length ? (
            <p className="text-sm text-ink-muted">
              {result ? 'No enrolled identities to compare.' : '—'}
            </p>
          ) : (
            <ol className="space-y-2">
              {result.top3.map((c, i) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{c.name}</p>
                      <p className="text-[11px] text-ink-muted">
                        {c.sample_count} sample{c.sample_count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-accent-dark">
                    {(c.confidence * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}
