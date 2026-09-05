# 🩻 AI X-Ray Detection System

An AI-assisted X-ray analysis tool. Upload an X-ray (elbow, hand, or knee) and
get back a fracture prediction, a Grad-CAM heatmap showing *where* the model
is looking, and a downloadable PDF report.

Built for demo/hackathon speed: one Docker container, one Render web
service, model weights pulled from Google Drive instead of bloating the git
repo.

---

## 📐 How it's put together

```
 browser
   │
   ▼
 Node/Express  (port 3000, or $PORT on Render) ── the only public-facing part
   │
   ▼  internal HTTP call
 Flask ML service (127.0.0.1:5000, never exposed outside the container)
   │
   ▼
 Keras classifier ("is this actually an x-ray?")
 HuggingFace model ("is it fractured, and where?")
```

| Folder | Role |
|---|---|
| `AI-X-RAY-Detection-System/` | Node/Express app — auth, sessions, upload UI, PDF/report display. |
| `x-rays-models/` | Flask app — runs the Keras + HuggingFace models, generates Grad-CAM heatmaps and PDFs. |
| `Dockerfile` + `start.sh` | Build both services into one image; `start.sh` boots Flask first, then Node, and downloads the model from Drive if it's missing. |

---

## ✅ Before you start — what you need

- Node.js 18+ and Python 3.10+ (only if running outside Docker)
- Docker (recommended — skips all the local Python/Node setup pain)
- A MongoDB connection string ([MongoDB Atlas free tier](https://www.mongodb.com/cloud/atlas/register) works great for a hackathon)
- A free [Cloudinary](https://cloudinary.com/users/register/free) account (uploaded x-rays, heatmaps, and PDFs are stored here, not on local disk)
- Your trained model files, zipped and uploaded to Google Drive (steps below — this is the one non-obvious part)

---

## 1️⃣ Get your model onto Google Drive

The HuggingFace fracture-detection model is too large to commit to git, so
it's fetched from Google Drive when the app starts.

**Step-by-step:**

1. On your machine, go to `x-rays-models/models/` — this should contain
   things like `config.json`, `preprocessor_config.json`, and the weights
   file for your fracture model.
2. **Zip the *contents* of that folder** — not the folder itself. Select all
   the files inside `models/`, right-click → compress/zip, so that when
   someone unzips it, the files land directly (no extra nested folder in
   between).
3. Upload that `.zip` to Google Drive.
4. Right-click the file in Drive → **Share** → change access to
   **"Anyone with the link"** → Copy link.
5. Your link will look like:
   ```
   https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234/view?usp=sharing
   ```
   The long string between `/d/` and `/view` is your **file ID**. Copy just
   that part:
   ```
   1AbCdEfGhIjKlMnOpQrStUvWxYz1234
   ```
6. Save that ID — you'll paste it into `MODEL_GDRIVE_ID` in the next steps.

> ⚠️ If sharing isn't set to "Anyone with the link," the download will fail
> silently and Flask won't start. This is the #1 thing to double check if
> the app won't boot.

---

## 2️⃣ Run it locally with Docker (fastest path)

This is the recommended way to run the whole thing — one command, no local
Python/Node setup needed.

```bash
# 1. Build the image
docker build -t xray-app .

# 2. Run it, filling in your real values
docker run -p 3000:3000 \
  -e MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/xray_app" \
  -e SESSION_SECRET="any-long-random-string-here" \
  -e MODEL_GDRIVE_ID="1AbCdEfGhIjKlMnOpQrStUvWxYz1234" \
  -e CLOUDINARY_CLOUD_NAME="your-cloud-name" \
  -e CLOUDINARY_API_KEY="your-api-key" \
  -e CLOUDINARY_API_SECRET="your-api-secret" \
  xray-app
```

3. Open **http://localhost:3000**

On first start, `start.sh` will print:
```
Downloading fracture-detection model from Google Drive (id: ...)...
Model ready in /app/x-rays-models/models
Starting Flask ML service on 127.0.0.1:5000...
```
Once you see that, Node boots and the app is ready.

---

## 3️⃣ Run it locally without Docker (for active development)

Only do this if you're actively editing code and want hot-reload — Docker
is simpler for just running the app.

**Flask service:**
```bash
cd x-rays-models
pip install -r requirements.txt
cp .env.example .env
# manually download your model zip from Drive and extract it into ./models/
python app.py
```
Runs on `http://127.0.0.1:5000`.

**Node service (in a second terminal):**
```bash
cd AI-X-RAY-Detection-System
npm install
cp .env.example .env
# fill in MONGO_URI, SESSION_SECRET, and Cloudinary keys in .env
npm run dev   # nodemon, hot-reload
```
Runs on `http://localhost:3000`.

---

## 4️⃣ Deploy live on Render

This is what you'll want for the actual hackathon demo link.

1. **Push the code to GitHub** (make sure `Dockerfile` stays at the repo
   root).
2. Go to **[render.com](https://render.com)** → **New +** → **Web Service**.
3. Connect your GitHub account and pick this repo.
4. Render should auto-detect **Runtime: Docker**. Leave Build Command and
   Start Command **blank** — the Dockerfile handles it.
5. **Instance type:** pick **Starter (2GB RAM)** or higher. The free tier
   will very likely run out of memory loading `tensorflow` + `torch` + the
   model together.
6. Under **Environment**, add these variables:

   | Variable | What to put |
   |---|---|
   | `MONGO_URI` | Your MongoDB Atlas connection string |
   | `SESSION_SECRET` | Any long random string |
   | `MODEL_GDRIVE_ID` | The file ID from Step 1 above |
   | `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard |
   | `CLOUDINARY_API_KEY` | From your Cloudinary dashboard |
   | `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard |

   Don't set `PORT` — Render assigns it automatically.

7. Click **Create Web Service**. Watch the logs — the build takes a few
   minutes (tensorflow + torch are big). After it deploys, check the
   *runtime* logs for the "Downloading fracture-detection model..." line to
   confirm the Drive download worked.
8. Once it says **Live**, open the Render URL, sign up/log in, and upload a
   test X-ray through `/analyze` to confirm everything works end-to-end.

---

## 🔑 Environment variable reference

**Node (`AI-X-RAY-Detection-System/.env`)**

| Variable | Required? | Notes |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB connection string |
| `SESSION_SECRET` | ✅ | App won't boot without it |
| `PORT` | ❌ | Defaults to 3000; leave unset on Render |
| `FLASK_URL` | ❌ | Defaults to `http://127.0.0.1:5000` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ✅ | Needed so uploads survive redeploys |

**Flask (`x-rays-models/.env`, or set on the container)**

| Variable | Required? | Notes |
|---|---|---|
| `MODEL_GDRIVE_ID` | ✅ (unless model already present) | From Step 1 above |
| `FLASK_HOST` | ❌ | Leave as `127.0.0.1` — keeps Flask internal-only |
| `PORT` | ❌ | Defaults to 5000 |
| `FLASK_DEBUG` | ❌ | Keep `false` outside local dev |
| `X_RAY_THRESHOLD` | ❌ | Defaults to `0.8` |

---

## 🎤 Right before you demo — quick checklist

- [ ] Drive model zip sharing is "Anyone with the link"
- [ ] `MODEL_GDRIVE_ID` is set wherever you're running (local, Docker, or Render)
- [ ] `SESSION_SECRET` and `MONGO_URI` are set — Node won't boot without them
- [ ] Cloudinary keys are set — otherwise uploaded images/reports vanish
- [ ] `FLASK_DEBUG=false` (or unset) on anything public-facing
- [ ] Ran one real X-ray through `/analyze` end-to-end right before presenting
- [ ] Have 2–3 sample X-ray images saved locally, ready to drag in live —
      don't rely on finding one on the spot or on venue wifi being fast