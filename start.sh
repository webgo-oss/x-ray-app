#!/usr/bin/env bash
# Runs both services in one container:
#  - Flask (ML API) stays private on 127.0.0.1:5000
#  - Node (web app) binds to $PORT and is the only thing Render exposes
set -e

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
