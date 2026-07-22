import { useEffect, useState } from 'react'
import type { FaceBox } from '../types'

interface Props {
  src: string
  faces?: FaceBox[]
  primaryBox?: [number, number, number, number] | null
  imageSize?: { width: number; height: number }
  label?: string
  className?: string
  /** Max display height — image scales down to fit, never crops */
  maxHeight?: number
}

/**
 * Draws face bounding boxes over an image.
 * Boxes use % of the image's natural size; the wrapper hugs the rendered
 * <img> so percentages stay aligned even when the photo is scaled down.
 */
export function FaceOverlay({
  src,
  faces = [],
  primaryBox,
  imageSize,
  label,
  className = '',
  maxHeight = 640,
}: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    imageSize ? { w: imageSize.width, h: imageSize.height } : null,
  )

  useEffect(() => {
    if (imageSize) {
      setNatural({ w: imageSize.width, h: imageSize.height })
    }
  }, [imageSize?.width, imageSize?.height, src])

  const boxes: Array<{ box: [number, number, number, number]; primary: boolean }> =
    []

  if (primaryBox) {
    boxes.push({ box: primaryBox, primary: true })
  }
  for (const f of faces) {
    const same =
      primaryBox &&
      Math.abs(f.box[0] - primaryBox[0]) < 1 &&
      Math.abs(f.box[1] - primaryBox[1]) < 1
    if (!same) boxes.push({ box: f.box, primary: false })
  }

  const w = natural?.w
  const h = natural?.h

  return (
    <div className={`flex justify-center overflow-visible ${className}`}>
      {/*
        inline-block wrapper sizes exactly to the rendered image.
        Scale with maxHeight / max-w-full — never crop with overflow:hidden.
      */}
      <div className="relative inline-block max-w-full rounded-2xl bg-ink/5 shadow-sm">
        <img
          src={src}
          alt="Face preview"
          className="block h-auto max-w-full rounded-2xl"
          style={{ maxHeight }}
          onLoad={(e) => {
            const img = e.currentTarget
            setNatural({ w: img.naturalWidth, h: img.naturalHeight })
          }}
        />
        {w &&
          h &&
          boxes.map(({ box, primary }, i) => {
            const [x1, y1, x2, y2] = box
            return (
              <div
                key={i}
                className={`pointer-events-none absolute border-2 ${
                  primary
                    ? 'border-accent shadow-[0_0_0_1px_rgba(13,148,136,0.35)]'
                    : 'border-sky-400/70'
                }`}
                style={{
                  left: `${(x1 / w) * 100}%`,
                  top: `${(y1 / h) * 100}%`,
                  width: `${((x2 - x1) / w) * 100}%`,
                  height: `${((y2 - y1) / h) * 100}%`,
                }}
              >
                {primary && label && (
                  <span className="absolute bottom-full left-0 mb-1 max-w-[240px] truncate rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                    {label}
                  </span>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
