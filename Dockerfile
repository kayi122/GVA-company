# GVA Sales Pipeline — production image
# Build:  docker compose build      Run: docker compose up -d   (see DEPLOY.md)

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client && npx prisma generate --schema server/prisma/schema.prisma

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=4000 \
    DATABASE_URL=file:/data/gva.db \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups
COPY --from=build /app /app
RUN mkdir -p /data && chown -R node:node /data /app/node_modules/.prisma && chmod +x /app/docker-entrypoint.sh
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Starts as root only to fix the data disk's ownership, then runs the app as "node" (see docker-entrypoint.sh)
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
