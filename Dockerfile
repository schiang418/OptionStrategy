# Use Node.js base image (matching OptionScope)
FROM node:22-slim

# Install system dependencies required for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci 2>/dev/null || npm install

# Install Playwright Chromium browser
RUN npx playwright install chromium --with-deps

# Copy source code
COPY . .

# Build frontend and server
RUN npx vite build && npx tsc -p tsconfig.server.json

# Remove dev dependencies after build
RUN npm prune --production 2>/dev/null || true

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
