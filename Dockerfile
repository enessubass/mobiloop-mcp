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

LABEL io.modelcontextprotocol.server.name="io.github.enessubass/mobiloop-mcp"

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates sqlite3 \
  && groupadd --gid 10001 mobiloop \
  && useradd --uid 10001 --gid mobiloop --create-home --shell /usr/sbin/nologin mobiloop \
  && mkdir /workspace \
  && chown mobiloop:mobiloop /workspace \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=mobiloop:mobiloop --from=build /app/node_modules ./node_modules
COPY --chown=mobiloop:mobiloop --from=build /app/dist/src ./dist/src
COPY --chown=mobiloop:mobiloop package.json README.md SECURITY.md LICENSE CHANGELOG.md CONTRIBUTING.md mobiloop.config.example.json ./
COPY --chown=mobiloop:mobiloop docs ./docs
COPY --chown=mobiloop:mobiloop examples ./examples
COPY --chown=mobiloop:mobiloop schema ./schema

VOLUME ["/workspace"]
ENV MOBILOOP_WORKSPACE_ROOT=/workspace
USER mobiloop

ENTRYPOINT ["node", "/app/dist/src/index.js"]
