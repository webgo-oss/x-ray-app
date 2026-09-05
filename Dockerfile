FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3 alongside Node
RUN apt-get update --fix-missing \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip python3-venv \
       libgl1 unzip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# --- Python side ---
COPY x-rays-models/requirements.txt ./x-rays-models/requirements.txt
RUN python3 -m pip install --no-cache-dir --break-system-packages -r x-rays-models/requirements.txt \
    && python3 -c "import gdown; print('gdown OK:', gdown.__version__)"

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