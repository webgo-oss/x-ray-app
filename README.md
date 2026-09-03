# AI X-Ray Detection System

AI-assisted X-ray analysis: upload an X-ray (elbow, hand, or knee), get a
fracture prediction with a Grad-CAM heatmap and a downloadable PDF report.

## Architecture

Two services run side by side:

- **`AI-X-RAY-Detection-System/`** — Node/Express app. Handles auth, sessions,
  the UI, file upload, and talks to the Flask service over HTTP.
- **`x-rays-models/`** — Flask service. Runs the Keras "is this an x-ray?"
  classifier, the fracture-detection model, Grad-CAM heatmap generation, and
  PDF report generation.

```
browser -> Node/Express (port 3000) -> Flask (port 5000) -> models
```

## Setup

### 1. Flask service (`x-rays-models/`)

```bash
cd x-rays-models
pip install -r requirements.txt
```

**⚠️ Required and not included in this repo:** a `models/` folder next to
`app.py` containing the HuggingFace fracture-classification model
(`AutoImageProcessor` + `AutoModelForImageClassification`,
`local_files_only=True`). The app will not start without it — grab it from
wherever the team originally downloaded/trained it and drop it in as
`x-rays-models/models/`.

Optional — copy `.env` for custom port/host/debug/threshold settings:

```bash
cp .env.example .env
```

Run it:

```bash
python app.py
```

Runs on `http://127.0.0.1:5000` by default. If you change its port, update
`FLASK_URL` in the Node `.env` to match.

### 2. Node service (`AI-X-RAY-Detection-System/`)

```bash
cd AI-X-RAY-Detection-System
npm install
cp .env.example .env
# fill in MONGO_URI and SESSION_SECRET in .env
npm start        # or: npm run dev (nodemon)
```

Runs on `http://localhost:3000` (or `$PORT` if set, for deployment).

Needs a running MongoDB instance (local, or a free Atlas cluster) — set
`MONGO_URI` accordingly.

### 3. Loading animation video

`AI-X-RAY-Detection-System/public/videos/loading.mp4` (with
`public/images/loading-poster.jpg` as its poster frame) needs to exist for
the upload-check loading screen. Both are already in this repo.

## Demo day checklist

- [ ] Both services running locally, `/analyze` end-to-end tested with a real
      X-ray image right before presenting
- [ ] A couple of sample X-ray images on hand (not relying on finding one
      live, or on hospital wifi)
- [ ] `x-rays-models/app.py` has `debug=True` — fine for local dev, but flip
      it off if this ever gets deployed somewhere public
- [ ] `.env` filled in (`MONGO_URI`, `SESSION_SECRET`) — the app refuses to
      boot without `SESSION_SECRET`
- [ ] If deploying: Node reads `$PORT`, but the Flask service is hardcoded to
      port 5000 and called via `http://127.0.0.1:5000` — the two need to run
      on the same host/container for this to work as-is
