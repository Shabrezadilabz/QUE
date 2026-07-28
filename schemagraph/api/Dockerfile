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
ENV PORT=8787

EXPOSE 8787
CMD ["node", "src/index.js"]
