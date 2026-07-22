export interface FaceBox {
  box: [number, number, number, number]
  prob: number
  area: number
}

export interface Candidate {
  name: string
  confidence: number
  mean_confidence: number
  sample_count: number
}

export interface RecognizeResult {
  ok: boolean
  matched_name: string
  confidence: number
  is_match: boolean
  threshold: number
  top3: Candidate[]
  face_box: [number, number, number, number] | null
  image_size: { width: number; height: number }
  faces_detected: number
  all_faces: FaceBox[]
  image_path: string | null
  timestamp: string
}

export interface EnrollResult {
  ok: boolean
  name: string
  samples_added: number
  total_samples: number
  saved_files: string[]
  warnings: string[]
}

export interface Identity {
  name: string
  sample_count: number
  thumbnail: string | null
  samples: string[]
}

export interface LogEntry {
  timestamp: string
  matched_name: string
  confidence: number
  image_path: string | null
  is_match?: boolean
}

export interface PreviewResult {
  ok: boolean
  faces_detected: number
  faces: FaceBox[]
  image_size: { width: number; height: number }
  has_face: boolean
}

export interface HealthStatus {
  status: string
  model_loaded: boolean
  device: string
  identities: number
  threshold: number
}
