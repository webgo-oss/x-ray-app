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