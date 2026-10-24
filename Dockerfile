# One image: build the workspace, then run the API, which also serves the
# built client. `docker compose up` is the whole product on one port.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 needs a toolchain only if no prebuild matches this platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/aura.db
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data
VOLUME /data
EXPOSE 4000

# The server runs migrations and generates the seeded day when the database
# is empty, so a fresh container needs nothing else. One command, no external
# services, and the same start path the hosted deploy uses.
CMD ["node", "apps/api/dist/server.js"]
