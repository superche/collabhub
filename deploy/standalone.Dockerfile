# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY scripts/clean-package-output.mjs ./scripts/clean-package-output.mjs
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec tsc -b packages/protocol packages/strategy-sdk packages/domain-json packages/server-core packages/server-ws --force
RUN pnpm --filter @collabhub/server-ws build:bundle

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=4100
ENV COLLABHUB_DATA_DIR=/data
WORKDIR /app

RUN groupadd --system --gid 10001 collabhub \
  && useradd --system --uid 10001 --gid collabhub --home-dir /app collabhub \
  && mkdir -p /data && chown -R collabhub:collabhub /data

COPY --from=build --chown=collabhub:collabhub /app/packages/server-ws/dist/bin/collabhub-server.mjs /app/collabhub-server.mjs

USER 10001:10001
VOLUME ["/data"]
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4100/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "/app/collabhub-server.mjs"]
