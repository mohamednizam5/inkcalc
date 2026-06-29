# Single-stage build for Railway deployment
FROM node:22-slim

WORKDIR /app

# Install system dependencies first
RUN apt-get update && apt-get install -y \
    ghostscript \
    python3 \
    python3-pip \
    python3-pil \
    && rm -rf /var/lib/apt/lists/*

# Install Pillow and numpy via pip
RUN pip3 install --break-system-packages Pillow numpy

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy patches folder (required by pnpm)
COPY patches ./patches

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build frontend + backend
RUN pnpm build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
