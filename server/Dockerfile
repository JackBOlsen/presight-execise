# syntax=docker/dockerfile:1

# Node 24 because the server reads SQLite through the built-in `node:sqlite`,
# which is only available unflagged from Node 23.4 onwards. There is no native
# module to compile, so this image needs no python, make or g++ — which is a
# large part of why that driver was chosen.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
# A local cache keeps the install inside the layer, so Docker can reuse it.
ENV YARN_ENABLE_GLOBAL_CACHE=false

# ---------------------------------------------------------------- deps ------
# Only the manifests, so this layer is rebuilt when dependencies change rather
# than on every source edit.
FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN yarn install --immutable

# --------------------------------------------------------------- build ------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
# `shared` first: the server imports its compiled output and its type
# declarations, so the order is a real dependency rather than a convention.
RUN yarn workspace presight-shared build \
 && yarn workspace presight-server build

# ------------------------------------------------------------- runtime ------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/users.db

# Production dependencies only: the build tools above are several times the size
# of what actually runs.
COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# `focus` also installs the workspaces this one depends on, so presight-shared
# comes along without being named.
RUN yarn workspaces focus --production presight-server \
 && yarn cache clean --all

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist

# The database lives on a volume so it survives a redeploy. Created and owned
# here so the unprivileged user can write to it once the volume is mounted.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000

# Queries the database rather than merely answering, so the container is only
# reported healthy once it can actually serve a request. Compose uses this to
# hold the client back until the API is ready.
HEALTHCHECK --interval=10s --timeout=5s --start-period=45s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applies the schema and seeds when the volume is empty, then serves. The seeder
# skips an existing dataset, so this is safe on every restart.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/index.js"]
