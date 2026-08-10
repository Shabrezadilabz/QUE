FROM node:22-alpine
WORKDIR /app

COPY api/package.json api/package-lock.json* ./
RUN npm install --omit=dev

COPY api/src ./src
COPY api/scripts ./scripts
COPY api/fixtures ./fixtures
COPY api/eval ./eval
COPY db /db

ENV STITCH_PG_HOST=stitch-pg
ENV QUE_DB_DIR=/db
ENV PORT=8787

EXPOSE 8787
# Migrate metadata schema, then serve (Neon/Render: set DATABASE_URL)
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]
