# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npm run db:generate
COPY src ./src
RUN npm run build

# Migration CLI is isolated from the long-running API image.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "npm run db:migrate && node dist/seed.js"]

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir uploads && chown node:node uploads
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=4000
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
