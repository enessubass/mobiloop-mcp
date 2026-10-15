FROM node:26-bookworm-slim AS node-base

# Patch the npm CLI bundled by the base image; keep npm available for mobile project tools.
# Its published manifest retains monorepo-only dev entries, so patch the production graph only.
RUN npm install --global npm@12.2.0 --ignore-scripts --no-audit --fund=false \
  && npm --prefix /usr/local/lib/node_modules/npm --workspaces=false pkg delete devDependencies workspaces \
  && npm install --prefix /usr/local/lib/node_modules/npm --no-save --ignore-scripts \
    --omit=dev --workspaces=false --package-lock=false --no-audit --fund=false \
    brace-expansion@5.0.11 undici@6.28.1 \
  && npm cache clean --force

FROM node-base AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY schema ./schema
COPY skills ./skills
COPY scripts/run-tests.mjs scripts/android-ci-runtime.mjs ./scripts/
COPY .github/workflows/publish-ghcr.yml ./.github/workflows/publish-ghcr.yml
COPY examples/android-validation-loop.json examples/flutter-ios-validation-loop.json ./examples/
RUN npm test
RUN npm prune --omit=dev

FROM node-base AS runtime

LABEL io.modelcontextprotocol.server.name="io.github.enessubass/mobiloop-mcp"

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates sqlite3 \
  && groupadd --gid 10001 mobiloop \
  && useradd --uid 10001 --gid mobiloop --create-home --shell /usr/sbin/nologin mobiloop \
  && mkdir /workspace /artifacts \
  && chown mobiloop:mobiloop /workspace /artifacts \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=mobiloop:mobiloop --from=build /app/node_modules ./node_modules
COPY --chown=mobiloop:mobiloop --from=build /app/dist/src ./dist/src
COPY --chown=mobiloop:mobiloop package.json README.md SECURITY.md LICENSE CHANGELOG.md CONTRIBUTING.md mobiloop.config.example.json ./
COPY --chown=mobiloop:mobiloop docs ./docs
COPY --chown=mobiloop:mobiloop examples ./examples
COPY --chown=mobiloop:mobiloop schema ./schema
COPY --chown=mobiloop:mobiloop skills ./skills

VOLUME ["/workspace"]
ENV MOBILOOP_WORKSPACE_ROOT=/workspace
USER mobiloop

ENTRYPOINT ["node", "/app/dist/src/index.js"]
