import { useCallback, useRef, useState } from 'react'
import Webcam from 'react-webcam'

interface Props {
  onCapture: (file: File) => void
  disabled?: boolean
}

export function WebcamCapture({ onCapture, disabled }: Props) {
  const camRef = useRef<Webcam>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(() => {
    const shot = camRef.current?.getScreenshot()
    if (!shot) {
      setError('Could not capture frame')
      return
    }
    fetch(shot)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], `webcam_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        onCapture(file)
        setOpen(false)
      })
      .catch(() => setError('Capture failed'))
  }, [onCapture])

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        Use webcam
      </button>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink shadow-lg">
      <div className="relative aspect-video bg-black">
        <Webcam
          ref={camRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.92}
          videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
          className="h-full w-full object-cover"
          onUserMediaError={() =>
            setError('Camera access denied. Check browser permissions.')
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ink px-4 py-3">
        <p className="text-xs text-white/60">
          {error ?? 'Center your face, then capture'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-dark"
          >
            Capture
          </button>
        </div>
      </div>
    </div>
  )
}
