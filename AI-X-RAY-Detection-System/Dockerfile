FROM node:20-bookworm

WORKDIR /app

COPY AI-X-RAY-Detection-System/package*.json ./
RUN npm ci --omit=dev

COPY AI-X-RAY-Detection-System ./

EXPOSE 3000

CMD ["node", "active.js"]
