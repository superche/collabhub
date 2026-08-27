# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec tsc -b packages/protocol packages/strategy-sdk packages/domain-json packages/server-core packages/server-distributed --force
RUN pnpm build:distributed

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=896
WORKDIR /app

RUN groupadd --system --gid 10001 collabhub \
  && useradd --system --uid 10001 --gid collabhub --home-dir /app collabhub

COPY --from=build --chown=collabhub:collabhub /app/packages/server-distributed/dist/bin/collabhub-node.mjs /app/collabhub-node.mjs

USER 10001:10001
EXPOSE 7000 7100

CMD ["node", "/app/collabhub-node.mjs"]
