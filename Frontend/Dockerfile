# RestaurantOS frontend (Next.js). Two stages: build with full deps, then run a
# minimal standalone server. Requires `output: "standalone"` in next.config.ts.

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# The lockfile is not committed (see .gitignore) and is excluded from the build
# context; resolve fresh on Linux so native deps (tailwind/next) match the image.
COPY package.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_* values are inlined at build time and are read by the BROWSER, so
# they must be host-reachable URLs (the published ports), not compose service
# names. Passed in as build args from docker-compose.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AI_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AI_URL=$NEXT_PUBLIC_AI_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Run stage ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Standalone output bundles a minimal server.js plus its traced dependencies.
# Static assets and public/ are copied alongside it.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
