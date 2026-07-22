import { useCallback, useEffect, useState } from 'react'
import { deleteIdentity, errMessage, listIdentities, mediaUrl } from '../api'
import type { Identity } from '../types'

export function IdentitiesPage() {
  const [identities, setIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setIdentities(await listIdentities())
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onDelete = async (name: string) => {
    if (!confirm(`Delete identity "${name}" and all samples?`)) return
    setDeleting(name)
    try {
      await deleteIdentity(name)
      setIdentities((prev) => prev.filter((i) => i.name !== name))
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Enrolled identities</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Each identity folder holds sample images and a stacked{' '}
            <code className="font-mono text-xs">*_embedding.npy</code> file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted animate-pulse">Loading identities…</p>
      ) : identities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel px-6 py-16 text-center text-sm text-ink-muted">
          No identities yet. Enroll someone from the Enroll page.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {identities.map((id) => (
            <article
              key={id.name}
              className="overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-accent/40"
            >
              <div className="aspect-[4/3] bg-surface">
                {id.thumbnail ? (
                  <img
                    src={mediaUrl(id.thumbnail)}
                    alt={id.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-muted">
                    No thumbnail
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <h3 className="font-semibold text-ink">{id.name}</h3>
                  <p className="font-mono text-xs text-ink-muted">
                    {id.sample_count} sample{id.sample_count === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={deleting === id.name}
                  onClick={() => void onDelete(id.name)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  {deleting === id.name ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
