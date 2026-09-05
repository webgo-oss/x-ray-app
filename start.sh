#!/usr/bin/env bash
# Runs both services in one container:
#  - Flask (ML API) stays private on 127.0.0.1:5000
#  - Node (web app) binds to $PORT and is the only thing Render exposes
set -e

# ============================================================
# PASTE YOUR GOOGLE DRIVE MODEL LINK HERE (full share link or file ID)
MODEL_GDRIVE_LINK="https://drive.google.com/file/d/1U5vMqL6OJovJwI1HGt4dZ3O54JCxeOWE/view?usp=drive_link"
# ============================================================

MODEL_DIR="/app/x-rays-models/models"

# The HuggingFace fracture-classification model isn't committed to the repo
# (too large for git). Instead it's fetched from the Google Drive link above
# at container start. Expected Drive file: a .zip of the models/ folder
# (config.json, preprocessor_config.json, the weights file, etc. at the zip
# root, not nested one level down).
if [ -z "$(ls -A "$MODEL_DIR" 2>/dev/null)" ]; then
  if [ -z "$MODEL_GDRIVE_LINK" ] || [ "$MODEL_GDRIVE_LINK" = "<here drive link>" ]; then
    echo "ERROR: $MODEL_DIR is empty and MODEL_GDRIVE_LINK is not set." >&2
    echo "Edit start.sh and paste your Google Drive link/file ID into MODEL_GDRIVE_LINK." >&2
    exit 1
  fi
  echo "Downloading fracture-detection model from Google Drive..."
  mkdir -p "$MODEL_DIR"
  python3 -m gdown "$MODEL_GDRIVE_LINK" -O /tmp/model.zip
  unzip -o /tmp/model.zip -d "$MODEL_DIR"
  rm -f /tmp/model.zip

  # Self-heal a common zipping mistake: if the zip included the "models"
  # folder itself (not just its contents), extraction lands one level too
  # deep as $MODEL_DIR/models/config.json etc. Detect that and flatten it.
  if [ -d "$MODEL_DIR/models" ] && [ ! -f "$MODEL_DIR/config.json" ]; then
    echo "Detected nested models/models folder from the zip — flattening..."
    mv "$MODEL_DIR"/models/* "$MODEL_DIR"/
    rmdir "$MODEL_DIR/models"
  fi

  if [ ! -f "$MODEL_DIR/config.json" ]; then
    echo "ERROR: $MODEL_DIR/config.json not found after extraction and flattening." >&2
    echo "Check that your Drive zip contains the model files directly, not nested in another folder." >&2
    find "$MODEL_DIR" -maxdepth 2 >&2
    exit 1
  fi

  echo "Model ready in $MODEL_DIR"
else
  echo "Model already present in $MODEL_DIR, skipping download."
fi

echo "Starting Flask ML service on 127.0.0.1:5000..."
cd /app/x-rays-models
python app.py &
FLASK_PID=$!

echo "Starting Node.js app..."
cd /app/AI-X-RAY-Detection-System
node active.js &
NODE_PID=$!

# If either process dies, kill the other and exit so Render marks the deploy
# as crashed instead of quietly running with a broken service.
wait -n "$FLASK_PID" "$NODE_PID"
exit $?