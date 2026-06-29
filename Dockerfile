# ---- Build Stage ----
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend + backend
RUN pnpm build

# ---- Production Stage ----
FROM node:22-slim AS runner

WORKDIR /app

# Install system dependencies: Ghostscript (for PDF rasterization) + Python3 + Pillow deps
RUN apt-get update && apt-get install -y \
    ghostscript \
    python3 \
    python3-pip \
    python3-pil \
    libtiff5-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip3 install --break-system-packages Pillow numpy

# Install pnpm for production deps
RUN npm install -g pnpm

# Copy package files and install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy Python scripts
COPY server/rasterize.py ./dist/rasterize.py
COPY server/analyze_cmyk.py ./dist/analyze_cmyk.py

# Copy database seed
COPY database_seed.sql ./database_seed.sql

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
