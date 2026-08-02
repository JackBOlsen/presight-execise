# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
ENV YARN_ENABLE_GLOBAL_CACHE=false

COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN yarn install --immutable

COPY tsconfig.base.json ./
COPY shared shared
COPY client client
# The client imports the contract's types, so `shared` has to be compiled before
# the client's typecheck can pass.
RUN yarn workspace presight-shared build \
 && yarn workspace presight-client build

# ------------------------------------------------------------- runtime ------
# The built client is static files. Serving them from nginx rather than from the
# Node process keeps the API free of asset traffic, and gives compression,
# caching headers and the SPA fallback without writing any of it.
FROM nginx:1.29-alpine AS runtime

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1
