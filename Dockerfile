# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy monorepo files
COPY pnpm-workspace.yaml package.json ./
COPY client ./client
COPY server ./server

# Install all dependencies (client + server)
RUN pnpm install --frozen-lockfile

# Build frontend into server/dist
RUN pnpm --filter client run build

# ---------- Stage 2: Production image ----------
FROM node:22-alpine AS production
WORKDIR /app

# Install pnpm for runtime (optional)
RUN npm install -g pnpm

# Copy server only
COPY --from=builder /app/server ./server
COPY --from=builder /app/server/package.json ./package.json

WORKDIR /app/server

EXPOSE 3000

ENV NODE_ENV=production
CMD ["pnpm", "start"]
