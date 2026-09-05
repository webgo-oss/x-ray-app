# AI X-Ray Detection System

AI-assisted X-ray analysis: upload an X-ray (elbow, hand, or knee), get a
fracture prediction with a Grad-CAM heatmap and a downloadable PDF report.

## Architecture

Two services run side by side, packaged into a **single Docker container**:

```
browser -> Node/Express (port 3000, or $PORT) -> Flask (127.0.0.1:5000) -> models
```

| Service | Path | Responsibility |
|---|---|---|
| **Node/Express** | `AI-X-RAY-Detection-System/` | Auth, sessions, UI, file upload, talks to Flask over HTTP. The only service exposed externally. |
| **Flask** | `x-rays-models/` | Keras "is this an x-ray?" classifier, HuggingFace fracture-detection model, Grad-CAM heatmaps, PDF report generation. Bound to `127.0.0.1` only — never reachable directly from outside the container. |

`start.sh` boots both processes and exits (killing the other) if either one
dies, so a crash surfaces as a failed deploy instead of a silently broken
service.

## Model delivery (Google Drive)

The HuggingFace fracture-classification model (`AutoImageProcessor` +
`AutoModelForImageClassification`) is too large to commit to git. Instead,
`start.sh` downloads it from Google Drive **at container start**, before
Flask boots:

1. Zip your local `x-rays-models/models/` folder so the model files
   (`config.json`, `preprocessor_config.json`, the weights file, etc.) sit at
   the **root** of the zip — not nested inside another folder.
2. Upload that zip to Google Drive and set sharing to **"Anyone with the
   link"**.
3. Grab the file ID from the share URL:
   `https://drive.google.com/file/d/`**`THIS_PART`**`/view`
4. Set it as the `MODEL_GDRIVE_ID` environment variable (locally in `.env`,
   or in Render's dashboard — see below).

On every container start, `start.sh` checks if `x-rays-models/models/` is
empty; if so it pulls and unzips the file via `gdown` before launching
Flask. If the folder already has content (e.g. you mounted it another way),
the download is skipped.

> **Note:** Google Drive throttles/blocks downloads of files that get a lot
> of traffic from the same link in a short window (its "too many users"
> quota page). For a personal project this is rarely an issue, but if the
> service restarts a lot in a short period, don't be surprised if it
> occasionally fails to download — retry the deploy in that case, or move to
> a purpose-built store (S3, Cloudinary, HF Hub) if it becomes a real
> problem.

## Local setup

### 1. Flask service (`x-rays-models/`)

```bash
cd x-rays-models
pip install -r requirements.txt
```

Get the model folder onto disk one of two ways:

- **Manual:** download your zipped `models/` folder from Drive yourself and
  extract it to `x-rays-models/models/`.
- **Scripted (matches production):** `export MODEL_GDRIVE_ID=<your file id>`
  then run `bash ../start.sh` from the repo root instead of `python app.py`
  directly — it will fetch and unzip the model before starting Flask (and
  will also start Node, so this is really more of a full-stack smoke test).

Copy `.env` for custom port/host/debug/threshold settings:

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
# fill in MONGO_URI, SESSION_SECRET, and Cloudinary keys in .env
npm start        # or: npm run dev (nodemon)
```

Runs on `http://localhost:3000` (or `$PORT` if set, for deployment). Needs a
running MongoDB instance (local, or a free Atlas cluster) — set `MONGO_URI`
accordingly.

### 3. Loading animation video

`AI-X-RAY-Detection-System/public/videos/loading.mp4` (with
`public/images/loading-poster.jpg` as its poster frame) needs to exist for
the upload-check loading screen. Both are already in this repo.

## Running with Docker (recommended — matches production)

The Dockerfile builds one image containing both Python and Node, installs
each service's dependencies, and runs `start.sh` as the container's entry
point.

```bash
docker build -t xray-app .

docker run -p 3000:3000 \
  -e MONGO_URI="mongodb+srv://..." \
  -e SESSION_SECRET="a-long-random-string" \
  -e MODEL_GDRIVE_ID="your-drive-file-id" \
  -e CLOUDINARY_CLOUD_NAME="..." \
  -e CLOUDINARY_API_KEY="..." \
  -e CLOUDINARY_API_SECRET="..." \
  xray-app
```

Visit `http://localhost:3000`. Flask runs on `127.0.0.1:5000` **inside** the
container only — it is never published to the host.

## Deploying to Render

1. **Push to GitHub.** Render deploys from a connected Git repo. Make sure
   the `Dockerfile` stays at the repo root.
2. **New Web Service → connect the repo → Runtime: Docker.** Render
   auto-detects the root `Dockerfile`. Leave the build/start commands
   blank — `CMD ["./start.sh"]` handles both.
3. **Instance type:** pick at least **Starter (2GB RAM)**. The free tier is
   very likely to run out of memory loading `tensorflow` + `torch` + the
   fracture model together.
4. **Environment variables** (Render dashboard → Environment):

   | Variable | Value |
   |---|---|
   | `MONGO_URI` | Your MongoDB Atlas connection string |
   | `SESSION_SECRET` | Long random string — Node exits at boot without it |
   | `MODEL_GDRIVE_ID` | Google Drive file ID of the zipped model folder |
   | `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard |
   | `CLOUDINARY_API_KEY` | From your Cloudinary dashboard |
   | `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard |
   | `X_RAY_THRESHOLD` | Optional, defaults to `0.8` |

   Do **not** set `PORT` — Render injects it automatically and `active.js`
   already reads `process.env.PORT`. Leave `FLASK_HOST`/`FLASK_URL` alone;
   they're baked into the Dockerfile as `127.0.0.1` defaults so Flask stays
   internal.

5. **Uploads, heatmaps, PDFs.** Render's disk is ephemeral and wiped on every
   redeploy — this is exactly why the app uploads generated files to
   Cloudinary instead of keeping them in `public/uploads`. Just make sure
   the three Cloudinary variables above are set, or generated files will
   disappear on the next deploy.
6. **Deploy and watch the build logs.** The build installs Python deps then
   runs `npm ci --omit=dev` — expect a slower-than-usual build given
   `tensorflow`/`torch`. Watch the *runtime* logs after deploy for the
   "Downloading fracture-detection model from Google Drive..." line, then
   confirm Flask loads without an out-of-memory kill.
7. **Verify.** Hit the deployed URL to confirm Node booted, then run a real
   x-ray through `/analyze` end-to-end, same as the local demo checklist
   below.

## Demo day checklist

- [ ] Both services running locally, `/analyze` end-to-end tested with a real
      X-ray image right before presenting
- [ ] A couple of sample X-ray images on hand (not relying on finding one
      live, or on hospital wifi)
- [ ] `x-rays-models/app.py` has `debug=False` before anything public-facing
      (`FLASK_DEBUG=true` is fine for local dev only — Werkzeug's debugger is
      a known remote-code-execution vector if reachable externally)
- [ ] `.env` filled in (`MONGO_URI`, `SESSION_SECRET`, `MODEL_GDRIVE_ID`,
      Cloudinary keys) — the app refuses to boot without `SESSION_SECRET`,
      and Flask refuses to start without a resolvable model
- [ ] Google Drive model zip's sharing is set to "Anyone with the link" (a
      private file will fail the `gdown` download silently)
- [ ] If deploying: confirm the instance has enough RAM for
      `tensorflow` + `torch` + the fracture model (2GB+ recommended)
