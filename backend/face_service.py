"""
FaceNet face detection, embedding, and classification service.

Pipeline:
  1. MTCNN detects + aligns faces (160x160)
  2. InceptionResnetV1 (vggface2) produces 512-D L2-normalized embeddings
  3. Cosine similarity matches query embeddings against enrolled identities

Multiple faces: the largest (by bounding-box area) face is used.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import torch
from facenet_pytorch import InceptionResnetV1, MTCNN
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths & config
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
EMBEDDINGS_DIR = DATA_DIR / "embeddings"
UPLOADS_DIR = DATA_DIR / "uploads"
LOGS_DIR = DATA_DIR / "logs"
LOG_FILE = LOGS_DIR / "recognition_log.json"

# Cosine similarity threshold — below this → "Unknown"
DEFAULT_THRESHOLD = 0.60
FACE_SIZE = 160


def ensure_data_dirs() -> None:
    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    if not LOG_FILE.exists():
        LOG_FILE.write_text("[]", encoding="utf-8")


def sanitize_name(name: str) -> str:
    """Safe folder name: letters, digits, spaces, hyphens, underscores."""
    cleaned = re.sub(r"[^\w\s\-]", "", name.strip(), flags=re.UNICODE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        raise ValueError("Person name must contain at least one alphanumeric character")
    return cleaned


# ---------------------------------------------------------------------------
# Core FaceService
# ---------------------------------------------------------------------------
class FaceService:
    def __init__(self, threshold: float = DEFAULT_THRESHOLD) -> None:
        self.threshold = threshold
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.mtcnn: MTCNN | None = None
        self.resnet: InceptionResnetV1 | None = None
        # In-memory cache: person_name -> (N, 512) float32 array of sample embeddings
        self._cache: dict[str, np.ndarray] = {}
        self._ready = False

    @property
    def ready(self) -> bool:
        return self._ready

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def load_models(self) -> None:
        """Load MTCNN + FaceNet once at startup."""
        ensure_data_dirs()
        logger.info("Loading models on device=%s …", self.device)

        self.mtcnn = MTCNN(
            image_size=FACE_SIZE,
            margin=20,
            min_face_size=40,
            thresholds=[0.6, 0.7, 0.7],
            factor=0.709,
            post_process=True,
            keep_all=True,
            device=self.device,
        )
        self.resnet = InceptionResnetV1(pretrained="vggface2").eval().to(self.device)

        self.reload_cache()
        self._ready = True
        logger.info(
            "Models ready. Enrolled identities: %d",
            len(self._cache),
        )

    def reload_cache(self) -> None:
        """Rebuild {name: embeddings} from disk."""
        cache: dict[str, np.ndarray] = {}
        if not EMBEDDINGS_DIR.exists():
            self._cache = cache
            return

        for person_dir in sorted(EMBEDDINGS_DIR.iterdir()):
            if not person_dir.is_dir():
                continue
            npy_path = person_dir / f"{person_dir.name}_embedding.npy"
            if not npy_path.exists():
                # Fallback: any .npy in the folder
                npy_files = list(person_dir.glob("*.npy"))
                if not npy_files:
                    continue
                npy_path = npy_files[0]

            try:
                emb = np.load(npy_path)
                emb = np.atleast_2d(emb).astype(np.float32)
                # Ensure L2-normalized
                norms = np.linalg.norm(emb, axis=1, keepdims=True)
                norms = np.clip(norms, 1e-8, None)
                emb = emb / norms
                cache[person_dir.name] = emb
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to load embeddings for %s: %s", person_dir.name, exc)

        self._cache = cache
        logger.info("Cache rebuilt with %d identities", len(cache))

    # ------------------------------------------------------------------
    # Detection & embedding
    # ------------------------------------------------------------------
    def detect_and_align(
        self,
        image: Image.Image,
        *,
        return_all: bool = False,
    ) -> tuple[torch.Tensor | None, list[dict[str, Any]]]:
        """
        Detect faces with MTCNN and return aligned 160x160 tensor(s).

        Returns:
            face_tensor: (3, 160, 160) for the largest face, or None
            faces_meta: list of {box, prob, area} for every detected face
                        (boxes are [x1, y1, x2, y2] in original image coords)
        """
        if self.mtcnn is None:
            raise RuntimeError("Models not loaded")

        img = image.convert("RGB")
        boxes, probs = self.mtcnn.detect(img)

        if boxes is None or len(boxes) == 0:
            return None, []

        faces_meta: list[dict[str, Any]] = []
        for box, prob in zip(boxes, probs):
            x1, y1, x2, y2 = [float(v) for v in box]
            area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
            faces_meta.append(
                {
                    "box": [x1, y1, x2, y2],
                    "prob": float(prob) if prob is not None else 0.0,
                    "area": area,
                }
            )

        # Prefer largest face by area
        faces_meta.sort(key=lambda f: f["area"], reverse=True)

        # Extract aligned face crop(s) via MTCNN forward
        aligned = self.mtcnn(img)
        if aligned is None:
            return None, faces_meta

        if aligned.ndim == 3:
            # Single face → (3, 160, 160)
            primary = aligned
            if return_all:
                return primary.unsqueeze(0), faces_meta
            return primary, faces_meta

        # Multiple: (N, 3, 160, 160) — pick largest by matching box order from detect.
        # MTCNN keep_all returns faces in detection order; we re-sort by area.
        # Safest approach: re-run extract on the chosen box region via mtcnn.extract
        primary_box = faces_meta[0]["box"]
        try:
            # extract expects boxes as list of [x1,y1,x2,y2]
            cropped = self.mtcnn.extract(img, [primary_box], save_path=None)
            if cropped is None:
                # Fall back to first tensor in batch
                primary = aligned[0]
            else:
                primary = cropped[0] if cropped.ndim == 4 else cropped
        except Exception:  # noqa: BLE001
            primary = aligned[0]

        if return_all:
            return aligned, faces_meta
        return primary, faces_meta

    def get_embedding(self, face_tensor: torch.Tensor) -> np.ndarray:
        """
        Run FaceNet on an aligned face tensor → L2-normalized 512-D vector.

        Accepts (3, 160, 160) or (N, 3, 160, 160). Returns (512,) or (N, 512).
        """
        if self.resnet is None:
            raise RuntimeError("Models not loaded")

        if face_tensor.ndim == 3:
            face_tensor = face_tensor.unsqueeze(0)

        face_tensor = face_tensor.to(self.device)
        with torch.no_grad():
            emb = self.resnet(face_tensor)

        emb_np = emb.cpu().numpy().astype(np.float32)
        norms = np.linalg.norm(emb_np, axis=1, keepdims=True)
        norms = np.clip(norms, 1e-8, None)
        emb_np = emb_np / norms

        if emb_np.shape[0] == 1:
            return emb_np[0]
        return emb_np

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """Cosine similarity between two 1-D vectors."""
        a = np.asarray(a, dtype=np.float32).reshape(1, -1)
        b = np.asarray(b, dtype=np.float32).reshape(1, -1)
        return float(sk_cosine(a, b)[0, 0])

    # ------------------------------------------------------------------
    # Enrollment
    # ------------------------------------------------------------------
    def enroll(
        self,
        name: str,
        images: list[Image.Image],
        original_filenames: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Enroll one or more face images for a person.
        Appends to existing samples if the person already exists.
        """
        name = sanitize_name(name)
        if not images:
            raise ValueError("At least one image is required")

        person_dir = EMBEDDINGS_DIR / name
        person_dir.mkdir(parents=True, exist_ok=True)

        existing = self._cache.get(name)
        new_embeddings: list[np.ndarray] = []
        saved_samples: list[str] = []
        errors: list[str] = []

        # Determine next sample index
        existing_samples = sorted(person_dir.glob("sample_*.jpg"))
        next_idx = 1
        if existing_samples:
            nums = []
            for p in existing_samples:
                m = re.search(r"sample_(\d+)\.jpg$", p.name)
                if m:
                    nums.append(int(m.group(1)))
            next_idx = (max(nums) + 1) if nums else len(existing_samples) + 1

        for i, img in enumerate(images):
            try:
                face_tensor, faces_meta = self.detect_and_align(img)
                if face_tensor is None:
                    label = (original_filenames or [None] * len(images))[i] or f"image_{i + 1}"
                    errors.append(f"No face detected in {label}")
                    continue

                emb = self.get_embedding(face_tensor)
                sample_name = f"sample_{next_idx}.jpg"
                sample_path = person_dir / sample_name
                img.convert("RGB").save(sample_path, quality=95)
                saved_samples.append(sample_name)
                new_embeddings.append(emb)
                next_idx += 1
            except Exception as exc:  # noqa: BLE001
                label = (original_filenames or [None] * len(images))[i] or f"image_{i + 1}"
                errors.append(f"Failed on {label}: {exc}")

        if not new_embeddings:
            # Clean empty dir if brand new
            if not any(person_dir.iterdir()):
                person_dir.rmdir()
            raise ValueError(
                "No faces could be enrolled. " + ("; ".join(errors) if errors else "Unknown error")
            )

        stacked_new = np.vstack(new_embeddings).astype(np.float32)
        if existing is not None:
            stacked = np.vstack([existing, stacked_new])
        else:
            stacked = stacked_new

        npy_path = person_dir / f"{name}_embedding.npy"
        np.save(npy_path, stacked)
        self._cache[name] = stacked

        return {
            "name": name,
            "samples_added": len(saved_samples),
            "total_samples": int(stacked.shape[0]),
            "saved_files": saved_samples,
            "warnings": errors,
        }

    # ------------------------------------------------------------------
    # Recognition
    # ------------------------------------------------------------------
    def recognize(
        self,
        image: Image.Image,
        *,
        save_upload: bool = True,
        original_filename: str = "query.jpg",
    ) -> dict[str, Any]:
        """
        Recognize the primary face in an image against enrolled identities.
        """
        face_tensor, faces_meta = self.detect_and_align(image)
        if face_tensor is None:
            raise ValueError("No face detected in the image")

        query_emb = self.get_embedding(face_tensor)

        upload_path: str | None = None
        if save_upload:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            safe_name = re.sub(r"[^\w.\-]", "_", original_filename)
            dest = UPLOADS_DIR / f"{ts}_{safe_name}"
            if dest.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                dest = dest.with_suffix(".jpg")
            image.convert("RGB").save(dest, quality=92)
            # Served via FastAPI StaticFiles at /media → DATA_DIR
            upload_path = f"/media/uploads/{dest.name}"

        candidates = self._rank_candidates(query_emb)
        best = candidates[0] if candidates else None

        if best and best["confidence"] >= self.threshold:
            matched_name = best["name"]
            confidence = best["confidence"]
            is_match = True
        else:
            matched_name = "Unknown"
            confidence = best["confidence"] if best else 0.0
            is_match = False

        primary_box = faces_meta[0]["box"] if faces_meta else None
        img_w, img_h = image.size

        result = {
            "matched_name": matched_name,
            "confidence": round(float(confidence), 4),
            "is_match": is_match,
            "threshold": self.threshold,
            "top3": candidates[:3],
            "face_box": primary_box,
            "image_size": {"width": img_w, "height": img_h},
            "faces_detected": len(faces_meta),
            "all_faces": faces_meta,
            "image_path": upload_path,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        self._append_log(
            {
                "timestamp": result["timestamp"],
                "matched_name": matched_name,
                "confidence": result["confidence"],
                "image_path": upload_path,
                "is_match": is_match,
            }
        )
        return result

    def _rank_candidates(self, query_emb: np.ndarray) -> list[dict[str, Any]]:
        """Score query against every enrolled person; return sorted list."""
        if not self._cache:
            return []

        q = query_emb.reshape(1, -1).astype(np.float32)
        scores: list[dict[str, Any]] = []

        for name, samples in self._cache.items():
            # Max similarity across that person's samples
            sims = sk_cosine(q, samples)[0]
            best_sim = float(np.max(sims))
            mean_sim = float(np.mean(sims))
            scores.append(
                {
                    "name": name,
                    "confidence": round(best_sim, 4),
                    "mean_confidence": round(mean_sim, 4),
                    "sample_count": int(samples.shape[0]),
                }
            )

        scores.sort(key=lambda x: x["confidence"], reverse=True)
        return scores

    # ------------------------------------------------------------------
    # Identity management
    # ------------------------------------------------------------------
    def list_identities(self) -> list[dict[str, Any]]:
        identities: list[dict[str, Any]] = []
        if not EMBEDDINGS_DIR.exists():
            return identities

        for person_dir in sorted(EMBEDDINGS_DIR.iterdir()):
            if not person_dir.is_dir():
                continue
            samples = sorted(person_dir.glob("sample_*.jpg"))
            thumbnail = None
            if samples:
                thumbnail = f"/media/embeddings/{person_dir.name}/{samples[0].name}"

            emb = self._cache.get(person_dir.name)
            sample_count = int(emb.shape[0]) if emb is not None else len(samples)

            identities.append(
                {
                    "name": person_dir.name,
                    "sample_count": sample_count,
                    "thumbnail": thumbnail,
                    "samples": [
                        f"/media/embeddings/{person_dir.name}/{s.name}" for s in samples
                    ],
                }
            )
        return identities

    def delete_identity(self, name: str) -> dict[str, Any]:
        name = sanitize_name(name)
        person_dir = EMBEDDINGS_DIR / name
        if not person_dir.exists():
            raise FileNotFoundError(f"Identity '{name}' not found")

        shutil.rmtree(person_dir)
        self._cache.pop(name, None)
        return {"deleted": name, "ok": True}

    # ------------------------------------------------------------------
    # Recognition log
    # ------------------------------------------------------------------
    def _append_log(self, entry: dict[str, Any]) -> None:
        ensure_data_dirs()
        try:
            raw = LOG_FILE.read_text(encoding="utf-8").strip() or "[]"
            data = json.loads(raw)
            if not isinstance(data, list):
                data = []
        except (json.JSONDecodeError, OSError):
            data = []

        data.append(entry)
        # Cap log size for lab convenience
        if len(data) > 500:
            data = data[-500:]
        LOG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def get_logs(self, limit: int = 100) -> list[dict[str, Any]]:
        ensure_data_dirs()
        try:
            raw = LOG_FILE.read_text(encoding="utf-8").strip() or "[]"
            data = json.loads(raw)
            if not isinstance(data, list):
                return []
            return list(reversed(data[-limit:]))
        except (json.JSONDecodeError, OSError):
            return []

    # ------------------------------------------------------------------
    # Helpers for preview / API
    # ------------------------------------------------------------------
    def preview_face(self, image: Image.Image) -> dict[str, Any]:
        """Detect face(s) without embedding — useful for frontend preview."""
        face_tensor, faces_meta = self.detect_and_align(image)
        return {
            "faces_detected": len(faces_meta),
            "faces": faces_meta,
            "image_size": {"width": image.size[0], "height": image.size[1]},
            "has_face": face_tensor is not None,
        }


# Module-level singleton used by FastAPI
face_service = FaceService()


# ---------------------------------------------------------------------------
# Standalone smoke test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(f"Device: {'cuda' if torch.cuda.is_available() else 'cpu'}")
    svc = FaceService()
    svc.load_models()

    # Synthetic smoke: blank image should report no face
    blank = Image.new("RGB", (320, 320), color=(120, 120, 120))
    face, meta = svc.detect_and_align(blank)
    print(f"Blank image faces: {len(meta)} (expected 0)")
    assert face is None

    print("Cache identities:", list(svc._cache.keys()))
    print("face_service.py OK")
