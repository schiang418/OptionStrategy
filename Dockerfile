FROM node:20-slim

# Install Chromium, ChromeDriver, Python3, and Selenium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    python3 \
    python3-pip \
    fonts-liberation \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Selenium for Python
RUN pip3 install selenium --break-system-packages

# Set Chromium paths
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci 2>/dev/null || npm install

# Copy source code
COPY . .

# Build frontend and server
RUN npx vite build && npx tsc -p tsconfig.server.json

# Copy Python automation scripts to where the compiled server expects them
RUN cp -r automation dist/automation

# Remove dev dependencies after build
RUN npm prune --production 2>/dev/null || true

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
