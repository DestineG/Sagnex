FROM node:22-bookworm-slim AS build

ARG SAGNEX_APT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn
ARG SAGNEX_NPM_REGISTRY=https://registry.npmmirror.com

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN sed -i -E "s|https?://deb.debian.org|${SAGNEX_APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.9.0 --registry="${SAGNEX_NPM_REGISTRY}"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --registry="${SAGNEX_NPM_REGISTRY}"

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS api

ENV NODE_ENV=production
ENV SAGNEX_API_HOST=0.0.0.0
ENV SAGNEX_API_PORT=4784
ENV SAGNEX_DATA_DIR=/data
ENV SAGNEX_BACKUP_DIR=/backups

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

EXPOSE 4784

USER node

CMD ["node", "apps/api/dist/server.js"]

FROM nginx:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
