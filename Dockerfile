FROM node:26-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY schema ./schema
RUN npm test
RUN npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates sqlite3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/src ./dist/src
COPY package.json README.md LICENSE CHANGELOG.md CONTRIBUTING.md mobiloop.config.example.json ./
COPY docs ./docs
COPY examples ./examples
COPY schema ./schema

VOLUME ["/workspace"]
ENV MOBILOOP_WORKSPACE_ROOT=/workspace

ENTRYPOINT ["node", "/app/dist/src/index.js"]
