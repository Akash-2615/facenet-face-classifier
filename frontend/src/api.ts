import axios from 'axios'
import type {
  EnrollResult,
  HealthStatus,
  Identity,
  LogEntry,
  PreviewResult,
  RecognizeResult,
} from './types'

const api = axios.create({
  baseURL: '',
  timeout: 120_000,
})

function errMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg ?? JSON.stringify(d)).join('; ')
    }
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Unexpected error'
}

export { errMessage }

export async function getHealth(): Promise<HealthStatus> {
  const { data } = await api.get<HealthStatus>('/health')
  return data
}

export async function enrollPerson(
  name: string,
  files: File[],
): Promise<EnrollResult> {
  const form = new FormData()
  form.append('name', name)
  for (const f of files) {
    form.append('images', f)
  }
  const { data } = await api.post<EnrollResult>('/enroll', form)
  return data
}

export async function recognizeFace(file: File): Promise<RecognizeResult> {
  const form = new FormData()
  form.append('image', file)
  const { data } = await api.post<RecognizeResult>('/recognize', form)
  return data
}

export async function previewFace(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('image', file)
  const { data } = await api.post<PreviewResult>('/preview', form)
  return data
}

export async function listIdentities(): Promise<Identity[]> {
  const { data } = await api.get<{ identities: Identity[] }>('/identities')
  return data.identities
}

export async function deleteIdentity(name: string): Promise<void> {
  await api.delete(`/identities/${encodeURIComponent(name)}`)
}

export async function getLogs(limit = 100): Promise<LogEntry[]> {
  const { data } = await api.get<{ logs: LogEntry[] }>('/logs', {
    params: { limit },
  })
  return data.logs
}

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  // Encode each path segment so names with spaces work (e.g. "Angelina Jolie")
  const raw = path.startsWith('/') ? path : `/${path}`
  return raw
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/')
}
