FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY index.html vite.config.ts tsconfig*.json tailwind.config.ts postcss.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
COPY scripts/build-server.mjs scripts/build-vps.mjs ./scripts/
RUN npm run build:vps && npm run build:server

FROM node:22-alpine AS api
ENV NODE_ENV=production TZ=Asia/Ho_Chi_Minh LOCAL_API_HOST=0.0.0.0 LOCAL_API_PORT=8787 LOCAL_STORAGE_ROOT=/app/storage LOCAL_SYNC_AUTO=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache tzdata && npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY --from=build /app/server-dist ./server-dist
COPY --from=build /app/server/db/seed.sql ./server/db/seed.sql
COPY scripts/sync-supabase-to-local.mjs scripts/sync-supabase-storage-to-local.mjs ./scripts/
COPY config/supabase-sync-tables.json ./config/supabase-sync-tables.json
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 8787
CMD ["node", "server-dist/index.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

