# ============================================================
# INVENTO ERP Backend - Production Multi-Stage Dockerfile
# ============================================================

# ---------- Stage 1: Build Stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript (outputs to ./dist)
RUN npm run build

# ---------- Stage 2: Production Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install curl for docker healthcheck
RUN apk add --no-cache curl

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory and grant permissions
RUN mkdir -p /app/uploads && chown -R node:node /app

# Run as non-root user for enterprise container security
USER node

# Expose backend port
EXPOSE 3000

# Docker Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start production server
CMD ["node", "dist/server.js"]
