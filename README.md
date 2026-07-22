# FaceNet Face Classification System

Full-stack lab app that enrolls faces with **FaceNet** embeddings and classifies them using **cosine similarity** (not SVM). Local file storage only — no database, Docker, or cloud.

## Pipeline

1. **MTCNN** — detect + align face (160×160)
2. **InceptionResnetV1** (`vggface2`) — 512-D L2-normalized embedding
3. **Cosine similarity** — compare query against enrolled samples; best match above threshold `0.60`, else `Unknown`

If multiple faces appear in one image, the **largest** face (by box area) is used.

## Stack

| Layer | Tech |
|--------|------|
| Backend | Python, FastAPI, Uvicorn, `facenet-pytorch`, PyTorch, NumPy, scikit-learn |
| Frontend | React, TypeScript, Vite, TailwindCSS, Axios, react-webcam |
| Storage | `backend/data/` — images + `.npy` embeddings + JSON recognition log |

## Project layout

```
backend/
  main.py              REST API
  face_service.py      detect → embed → match
  requirements.txt
  data/
    embeddings/<name>/ sample_*.jpg + <name>_embedding.npy
    uploads/           recognition queries
    logs/recognition_log.json
frontend/              React UI (Enroll, Recognize, Identities, Logs)
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- ~200MB for Torch + FaceNet weights (downloaded on first run)

## Run — backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- API: http://127.0.0.1:8000  
- Docs: http://127.0.0.1:8000/docs  
- Health: http://127.0.0.1:8000/health  

Smoke-test the FaceNet pipeline alone:

```bash
python face_service.py
```

## Run — frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 (Vite proxies API calls to port 8000).

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/enroll` | `name` + image(s) → save samples + embeddings |
| `POST` | `/recognize` | image → match, confidence, top-3, face box |
| `POST` | `/preview` | detect faces only (enroll preview) |
| `GET` | `/identities` | list enrolled people |
| `DELETE` | `/identities/{name}` | remove identity + embeddings |
| `GET` | `/logs` | recognition history |
| `GET` | `/health` | model loaded / device status |

## Lab flow

1. Start backend → wait for `"model_loaded": true` on `/health`
2. Start frontend
3. **Enroll** — 2–3 clear photos per person (same name appends samples)
4. **Recognize** — upload or webcam; see box + top-3 scores
5. **Identities** / **Logs** — manage people and history

## Matching notes

- Classifier: **cosine similarity** over L2-normalized FaceNet embeddings
- Per person: max similarity across their stored samples
- Threshold: `0.60` (change in `FaceService`)
- No SVM / KNN training — nearest-embedding match only
- CUDA used automatically if available; CPU is fine for demos
