FROM node:20-bullseye

# Install Python 3 alongside Node
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    libgl1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# --- Python side ---
COPY x-rays-models/requirements.txt ./x-rays-models/requirements.txt
RUN pip3 install --no-cache-dir -r x-rays-models/requirements.txt

# --- Node side ---
COPY AI-X-RAY-Detection-System/package*.json ./AI-X-RAY-Detection-System/
RUN cd AI-X-RAY-Detection-System && npm ci --omit=dev

# --- Copy the rest of the app ---
COPY x-rays-models ./x-rays-models
COPY AI-X-RAY-Detection-System ./AI-X-RAY-Detection-System
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Only Node's port needs to be exposed — Flask stays internal on 127.0.0.1
ENV FLASK_HOST=127.0.0.1
ENV FLASK_URL=http://127.0.0.1:5000
EXPOSE 3000

CMD ["./start.sh"]
