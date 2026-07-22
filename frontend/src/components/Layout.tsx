import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getHealth } from '../api'
import type { HealthStatus } from '../types'

const links = [
  { to: '/', label: 'Recognize', end: true },
  { to: '/enroll', label: 'Enroll' },
  { to: '/identities', label: 'Identities' },
  { to: '/logs', label: 'Logs' },
]

export function Layout() {
  const [health, setHealth] = useState<HealthStatus | null>(null)

  useEffect(() => {
    let alive = true
    const ping = () =>
      getHealth()
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null))
    ping()
    const id = setInterval(ping, 15_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 font-mono text-[11px] font-medium tracking-[0.18em] text-accent uppercase">
            FaceNet · VGGFace2
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Face Classifier
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-ink-muted">
            Enroll faces, generate 512-D embeddings, and classify with cosine similarity.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start rounded-full border border-line bg-panel px-3 py-1.5 text-xs sm:self-auto">
          <span
            className={`h-2 w-2 rounded-full ${
              health?.model_loaded ? 'bg-ok' : 'bg-warn animate-pulse'
            }`}
          />
          <span className="font-mono text-ink-muted">
            {health?.model_loaded
              ? `${health.device} · ${health.identities} enrolled`
              : 'Connecting…'}
          </span>
        </div>
      </header>

      <nav className="mb-8 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-ink text-white'
                  : 'text-ink-muted hover:bg-surface hover:text-ink'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-ink-muted">
        Local FaceNet pipeline · no cloud · embeddings stored under{' '}
        <code className="font-mono text-[11px]">backend/data/</code>
      </footer>
    </div>
  )
}
