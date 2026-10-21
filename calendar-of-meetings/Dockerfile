# syntax=docker/dockerfile:1

# --- Builder stage ---
FROM node:20-slim AS builder

# Установка инструментов для сборки better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    build-essential \
    pkg-config \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Зависимости (включая devDependencies для контракта и сборки)
COPY calendar-of-meetings/package.json calendar-of-meetings/package-lock.json calendar-of-meetings/.npmrc ./
ENV CFLAGS="-O2 -march=x86-64"
ENV CXXFLAGS="-O2 -march=x86-64"
RUN npm ci

# Исходники и всё необходимое для контракта/сборки
COPY calendar-of-meetings/contract ./contract
COPY calendar-of-meetings/public ./public
COPY calendar-of-meetings/server ./server
COPY calendar-of-meetings/src ./src
COPY calendar-of-meetings/index.html calendar-of-meetings/vite.config.ts calendar-of-meetings/postcss.config.cjs calendar-of-meetings/tsconfig*.json calendar-of-meetings/openapi-ts.config.ts ./

# Генерация контракта + типы + билд фронта + билд сервера
RUN npm run build

# --- Runtime stage ---
FROM node:20-slim AS runtime

ENV NODE_ENV=production
ENV AUTH_DISABLED=1

# Инструменты
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копируем node_modules с уже собранными нативными модулями из builder
COPY --from=builder /app/node_modules ./node_modules
COPY calendar-of-meetings/package.json calendar-of-meetings/package-lock.json ./

# Собранные артефакты
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# JSON-схема контракта, которую сервер читает в рантайме (import.meta.dirname)
COPY --from=builder /app/contract/schema ./contract/schema

# Entrypoint
COPY calendar-of-meetings/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Папка под SQLite
RUN mkdir -p /app/data && chown -R node:node /app

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist-server/index.js"]

USER node
EXPOSE 4000
