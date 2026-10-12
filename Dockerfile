# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3847 \
    DATABASE_PATH=/app/data/rssign.sqlite

WORKDIR /app

# tsx (a dev dependency) runs the TypeScript sources directly, so install everything.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY tsconfig.json ./
COPY config ./config
COPY public ./public
COPY src ./src

RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]

EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3847) + '/api/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly (not npm) so SIGTERM reaches the app for a clean SQLite shutdown.
CMD ["node", "--import", "tsx", "src/index.ts"]
