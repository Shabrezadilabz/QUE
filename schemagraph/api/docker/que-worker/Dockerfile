FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV QUE_WAREHOUSE_WORKER_ENABLED=true
ENV QUE_WAREHOUSE_WORKER_TICK_MS=5000

CMD ["node", "scripts/runWarehouseWorker.js"]
