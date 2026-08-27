# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY examples/todo-list-app ./examples/todo-list-app
COPY scripts/clean-package-output.mjs ./scripts/clean-package-output.mjs

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec tsc -b packages/protocol packages/strategy-sdk packages/domain-json packages/server-core packages/server-distributed packages/client-core examples/todo-list-app --force
RUN pnpm --filter @collabhub/todo-list-app build
RUN pnpm --filter @collabhub/todo-list-app build:server

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=10000
ENV COLLABHUB_HOST=0.0.0.0
ENV COLLABHUB_DATA_FILE=/tmp/collabhub-demo/drafts.json
ENV COLLABHUB_DEMO_STATIC_DIR=/app/public
WORKDIR /app

RUN groupadd --system --gid 10001 collabhub \
  && useradd --system --uid 10001 --gid collabhub --home-dir /app collabhub

COPY --from=build --chown=collabhub:collabhub /app/examples/todo-list-app/dist-server/collabhub-demo.mjs /app/server.mjs
COPY --from=build --chown=collabhub:collabhub /app/examples/todo-list-app/dist /app/public

USER 10001:10001
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:10000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "/app/server.mjs"]
