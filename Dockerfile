# syntax = docker/dockerfile:1

# Node 24 ships `node:sqlite` without an experimental flag. The app imports
# `node:sqlite` directly (lib/db/sqlite.ts), so do NOT drop below 24 unless you
# also add NODE_OPTIONS=--experimental-sqlite.
ARG NODE_VERSION=24.10.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Next.js"

# Next.js app lives here
WORKDIR /app

# Production environment
ENV NODE_ENV="production"


# --- Build stage: install all deps and compile the app -----------------------
FROM base AS build

# Build tooling, in case a (transitive) dependency needs a native compile.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*

# Install node modules (including dev deps needed for `next build`)
COPY package-lock.json package.json ./
RUN npm ci --include=dev

# Copy application source and build
COPY . .
RUN npm run build

# Drop dev dependencies for a smaller runtime image
RUN npm prune --omit=dev


# --- Runtime stage -----------------------------------------------------------
FROM base

# Copy the built application
COPY --from=build /app /app

# Fly routes to internal_port 8080 (see fly.toml); make Next listen there and
# bind to all interfaces so the container is reachable.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080

# Start the Next.js production server
CMD [ "npm", "run", "start" ]
