import { useCallback, useEffect, useState } from 'react'
import { errMessage, getLogs, mediaUrl } from '../api'
import type { LogEntry } from '../types'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLogs(await getLogs(150))
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Recognition log</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Append-only history from{' '}
            <code className="font-mono text-xs">data/logs/recognition_log.json</code>
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

      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-surface text-xs tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Match</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Image</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    No recognitions yet.
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={`${log.timestamp}-${i}`} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-medium ${
                          log.matched_name === 'Unknown'
                            ? 'text-ink-muted'
                            : 'text-accent-dark'
                        }`}
                      >
                        {log.matched_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {(log.confidence * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3">
                      {log.image_path ? (
                        <a
                          href={mediaUrl(log.image_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          view
                        </a>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
