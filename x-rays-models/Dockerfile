FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update --fix-missing \
    && apt-get install -y --no-install-recommends libgl1 unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --no-cache-dir -r requirements.txt \
    && python3 -c "import gdown; print('gdown OK:', gdown.__version__)"

COPY . ./
RUN chmod +x start-flask.sh

# This service IS the public surface now (no Node in front of it in this
# container) — Render assigns $PORT and routes traffic to it directly.
ENV FLASK_HOST=0.0.0.0

EXPOSE 5000

CMD ["./start-flask.sh"]
