#!/usr/bin/env bash
# Standalone Flask ML service — runs as its own Render Web Service, no Node
# in this container. Render assigns $PORT and routes public traffic to it
# directly, so this binds to 0.0.0.0:$PORT instead of 127.0.0.1.
set -e

# ============================================================
# PASTE YOUR GOOGLE DRIVE MODEL LINK HERE (full share link or file ID)
MODEL_GDRIVE_LINK="https://drive.google.com/file/d/1U5vMqL6OJovJwI1HGt4dZ3O54JCxeOWE/view?usp=drive_link"
# ============================================================

MODEL_DIR="/app/models"
PORT="${PORT:-5000}"

if [ -z "$(ls -A "$MODEL_DIR" 2>/dev/null)" ]; then
  if [ -z "$MODEL_GDRIVE_LINK" ] || [ "$MODEL_GDRIVE_LINK" = "<here drive link>" ]; then
    echo "ERROR: $MODEL_DIR is empty and MODEL_GDRIVE_LINK is not set." >&2
    echo "Edit start-flask.sh and paste your Google Drive link/file ID into MODEL_GDRIVE_LINK." >&2
    exit 1
  fi
  echo "Downloading fracture-detection model from Google Drive..."
  mkdir -p "$MODEL_DIR"

  DOWNLOAD_OK=0
  for attempt in 1 2 3; do
    echo "Download attempt $attempt/3..."
    rm -f /tmp/model.zip
    if timeout 180 python3 -m gdown "$MODEL_GDRIVE_LINK" -O /tmp/model.zip; then
      DOWNLOAD_OK=1
      break
    fi
    echo "Attempt $attempt failed or stalled — retrying..."
    sleep 5
  done

  if [ "$DOWNLOAD_OK" -ne 1 ]; then
    echo "ERROR: Failed to download the model from Google Drive after 3 attempts." >&2
    echo "This is usually a transient stall on Drive's end — try redeploying." >&2
    exit 1
  fi

  unzip -o /tmp/model.zip -d "$MODEL_DIR"
  rm -f /tmp/model.zip

  # Self-heal a common zipping mistake: if the zip included the "models"
  # folder itself (not just its contents), extraction lands one level too
  # deep. Detect that and flatten it.
  if [ -d "$MODEL_DIR/models" ] && [ ! -f "$MODEL_DIR/config.json" ]; then
    echo "Detected nested models/models folder from the zip — flattening..."
    mv "$MODEL_DIR"/models/* "$MODEL_DIR"/
    rmdir "$MODEL_DIR/models"
  fi

  if [ ! -f "$MODEL_DIR/config.json" ]; then
    echo "ERROR: $MODEL_DIR/config.json not found after extraction and flattening." >&2
    find "$MODEL_DIR" -maxdepth 2 >&2
    exit 1
  fi

  echo "Model ready in $MODEL_DIR"
else
  echo "Model already present in $MODEL_DIR, skipping download."
fi

echo "Starting Flask ML service on 0.0.0.0:$PORT..."
exec gunicorn --bind "0.0.0.0:$PORT" --workers 1 --threads 4 --timeout 120 app:app
