# ---- Base Stage ----
# Use a newer Alpine-based Node.js image compatible with your Vite version
FROM node:20-alpine AS base
# Install pnpm globally
RUN npm install -g pnpm

# ---- Dependencies Stage ----
# This stage is dedicated to installing all dependencies to leverage Docker's layer caching.
FROM base AS deps
WORKDIR /app
# Copy only the necessary package management files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# Install all dependencies for both client and server
RUN pnpm install

# ---- Builder Stage ----
# This stage builds the Vue.js client application.
FROM deps AS builder
WORKDIR /app
# Copy the entire project source to provide the necessary context for Vite's relative output path.
COPY . .
# Run the client build script
RUN pnpm --filter client run build

# ---- Production Stage ----
# This is the final, lean image that will be run in production.
FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

# Copy server dependency definitions from the root and server directory
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
# Install only the production dependencies for the server
RUN pnpm install --filter server --prod

# Copy the server source code
COPY server ./server

# Copy the built client from the 'builder' stage into the server's 'dist' directory.
# This matches your Vite config's outDir: '../server/dist'.
# Your Express server should be configured to serve static files from this 'dist' folder.
COPY --from=builder /app/server/dist ./server/dist

# Install pm2 for process management
RUN npm install -g pm2

# Expose the port the server will run on
EXPOSE 3000

# Command to start the server using pm2.
# PM2's 'no-daemon' mode is essential for Docker.
# IMPORTANT: Adjust 'server/src/index.js' to your actual server entrypoint file.
CMD ["pm2-runtime", "start", "server/src/index.js", "--name", "app"]

