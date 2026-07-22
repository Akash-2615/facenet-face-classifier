"""
FaceNet Face Classification API

Endpoints:
  POST   /enroll
  GET    /identities
  DELETE /identities/{name}
  POST   /recognize
  POST   /preview          # detect faces without classifying
  GET    /logs
  GET    /health
  GET    /media/...        # serve enrolled sample images
"""

from __future__ import annotations

import io
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

from face_service import DATA_DIR, ensure_data_dirs, face_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("facenet-api")

ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp"}


async def _read_image(upload: UploadFile) -> Image.Image:
    if upload.content_type and upload.content_type.lower() not in ALLOWED_TYPES:
        # Some browsers omit content_type — still try to open
        if upload.content_type not in (None, "", "application/octet-stream"):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {upload.content_type}. Use JPEG/PNG/WebP.",
            )
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_data_dirs()
    logger.info("Starting FaceNet service…")
    face_service.load_models()
    logger.info("Startup complete")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="FaceNet Face Classification",
    description="Lab exercise: FaceNet embeddings + local file storage",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve enrolled sample images & uploads
ensure_data_dirs()
app.mount("/media", StaticFiles(directory=str(DATA_DIR)), name="media")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if face_service.ready else "loading",
        "model_loaded": face_service.ready,
        "device": str(face_service.device),
        "identities": len(face_service._cache),
        "threshold": face_service.threshold,
    }


@app.post("/enroll")
async def enroll(
    name: str = Form(..., description="Person's name"),
    images: list[UploadFile] = File(..., description="One or more face images"),
) -> dict[str, Any]:
    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    pil_images: list[Image.Image] = []
    filenames: list[str] = []
    for f in images:
        pil_images.append(await _read_image(f))
        filenames.append(f.filename or "upload.jpg")

    try:
        result = face_service.enroll(name, pil_images, filenames)
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Enroll failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/recognize")
async def recognize(
    image: UploadFile = File(..., description="Query face image"),
) -> dict[str, Any]:
    pil = await _read_image(image)
    try:
        result = face_service.recognize(
            pil,
            save_upload=True,
            original_filename=image.filename or "query.jpg",
        )
        return {"ok": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Recognize failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/preview")
async def preview(
    image: UploadFile = File(..., description="Image to detect faces in"),
) -> dict[str, Any]:
    """Detect faces without classifying — used for enroll preview."""
    pil = await _read_image(image)
    try:
        result = face_service.preview_face(pil)
        return {"ok": True, **result}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Preview failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/identities")
def list_identities() -> dict[str, Any]:
    identities = face_service.list_identities()
    return {"ok": True, "count": len(identities), "identities": identities}


@app.delete("/identities/{name}")
def delete_identity(name: str) -> dict[str, Any]:
    try:
        result = face_service.delete_identity(name)
        return {"ok": True, **result}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/logs")
def get_logs(limit: int = Query(100, ge=1, le=500)) -> dict[str, Any]:
    logs = face_service.get_logs(limit=limit)
    return {"ok": True, "count": len(logs), "logs": logs}


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "FaceNet Face Classification API",
        "docs": "/docs",
        "health": "/health",
    }
