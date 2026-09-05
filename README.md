# AI X-Ray Detection System

**AI-powered fracture detection from X-ray images — with explainable
visual heatmaps and instant PDF medical reports.**

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-Python-000000?logo=flask&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-Keras-FF6F00?logo=tensorflow&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-HuggingFace-EE4C2C?logo=pytorch&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker&logoColor=white)

---

## The Problem

Reading X-rays takes trained radiologists, and in under-resourced clinics,
overloaded ERs, or remote areas, that expertise isn't always available fast
enough. A missed or delayed fracture read can mean a patient goes home
untreated.

## Our Solution

**AI X-Ray Detection System** gives anyone — a clinician, a triage nurse, a
student — an instant second opinion on an X-ray. Upload an image and the
system:

1. **Verifies it's actually an X-ray** (filters out irrelevant uploads
   before wasting compute on them)
2. **Classifies it for fractures** using a fine-tuned vision transformer
3. **Generates a Grad-CAM heatmap** so the prediction isn't a black box —
   you can see exactly which region of the bone drove the model's decision
4. **Produces a downloadable PDF report**, ready to attach to a patient
   record or share with a physician

All of this happens in seconds, through a clean web interface with
authentication, so results are tied to a real user session — not an
anonymous one-off tool.

---

## Features

- **Secure authentication** — session-based login with CSRF protection
- **Drag-and-drop X-ray upload** — elbow, hand, and knee X-rays supported
- **Two-stage ML pipeline** — a lightweight Keras gatekeeper model filters
  non-X-ray images before the heavier fracture-detection model runs
- **Grad-CAM explainability** — visual heatmap overlay showing the exact
  region the model attended to, not just a bare "fracture / no fracture" label
- **One-click PDF reports** — generated server-side and ready to download
  or share
- **Cloud-backed storage** — uploads, heatmaps, and reports persist via
  Cloudinary, so nothing is lost on redeploys
- **Single-container deployment** — the whole stack (frontend, backend,
  and both ML models) ships as one Docker image

---

## Architecture

```
 Browser
   │
   ▼
 Node.js / Express  ──  auth, sessions, UI, file uploads
   │  (internal HTTP call, never exposed externally)
   ▼
 Flask ML Service  ──  runs entirely inside the same container
   │
   ├── Keras CNN            → "Is this actually an X-ray?"
   └── HuggingFace ViT       → "Is it fractured, and where?"
        + Grad-CAM            → heatmap generation
        + ReportLab           → PDF report generation
```

Both services run in a single Docker container for simplicity — Flask is
bound to `127.0.0.1` internally and is never reachable from outside, so
Node/Express is the only public surface.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | EJS, vanilla JS |
| Backend | Node.js, Express |
| ML Service | Flask (Python) |
| Models | TensorFlow/Keras (X-ray classifier), HuggingFace Transformers + PyTorch (fracture detection ViT) |
| Explainability | Grad-CAM |
| Database | MongoDB |
| Media storage | Cloudinary |
| Reports | ReportLab (PDF generation) |
| Infra | Docker, deployed on Render |

---

## How It Works (User Flow)

1. User signs up / logs in
2. Uploads an X-ray image
3. System validates it's an X-ray, then runs fracture detection
4. Result is shown with a fracture/no-fracture verdict and a Grad-CAM
   heatmap overlay
5. User downloads a generated PDF report of the finding

---

## What's Next

- Expand supported X-ray regions beyond elbow/hand/knee
- Multi-class fracture severity grading, not just binary detection
- Doctor-review workflow for flagged cases
- Mobile-first capture flow for point-of-care use

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/webgo-oss/x-ray-app
cd x-ray-app-main
```

### 2. Get the model files from Google Drive

The fracture-detection model weights aren't stored in this repo (too
large for git) — they're distributed via a Google Drive link.

**Model download link:** `<PASTE_GOOGLE_DRIVE_LINK_HERE>`

- Grab the shared model `.zip` from the Drive link above.
- Extract it into `x-rays-models/models/` so the files (`config.json`,
  `preprocessor_config.json`, the weights file, etc.) sit directly inside
  that folder.

Alternatively, if you have the Drive file's ID, the app can download it
automatically at startup — see step 5.

### 3. Test images

Sample X-rays for testing the upload flow are included under
`test-xrays/`, split into two folders:

```
test-xrays/
├── Fractured/       # sample X-rays with a fracture present
└── Non_fractured/   # sample X-rays with no fracture
```

Use these to quickly verify both prediction paths (fracture / no fracture)
without needing real patient data.

### 4. Set up environment variables

Copy the example files and fill in your own values:

```bash
cp AI-X-RAY-Detection-System/.env.example AI-X-RAY-Detection-System/.env
cp x-rays-models/.env.example x-rays-models/.env
```

You'll need:
- A MongoDB connection string (`MONGO_URI`)
- A session secret (`SESSION_SECRET`)
- Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`) for storing uploads, heatmaps, and PDFs
- The Google Drive file ID for the model, if using automatic download
  (`MODEL_GDRIVE_ID`)

### 5. Run with Docker (recommended)

```bash
docker build -t xray-app .

docker run -p 3000:3000 \
  -e MONGO_URI="your-mongo-uri" \
  -e SESSION_SECRET="a-long-random-string" \
  -e MODEL_GDRIVE_ID="your-drive-file-id" \
  -e CLOUDINARY_CLOUD_NAME="your-cloud-name" \
  -e CLOUDINARY_API_KEY="your-api-key" \
  -e CLOUDINARY_API_SECRET="your-api-secret" \
  xray-app
```

If `MODEL_GDRIVE_ID` is set, the model is downloaded and unzipped
automatically on container start — no manual extraction needed.

Open **http://localhost:3000**.

### 6. Run without Docker (for development)

```bash
# Terminal 1 — Flask ML service
cd x-rays-models
pip install -r requirements.txt
python app.py

# Terminal 2 — Node/Express app
cd AI-X-RAY-Detection-System
npm install
npm run dev
```

Node runs on `http://localhost:3000`, Flask on `http://127.0.0.1:5000`.

