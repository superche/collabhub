# React 快速接入

本指南为结构化 React 状态接入协同，不要求把领域模型迁入 CollabHub。WebSocket、pending、重连、恢复和诊断状态由 SDK 托管。

> `0.1.0` 仍在验收，公共 registry 包已准备但尚未发布。在明确批准发布前，请使用仓库 workspace 或本地 tarball。

## 1. 启动本地服务

```bash
pnpm install --frozen-lockfile
docker compose -f deploy/docker-compose.yml up --build -d
```

本地 WebSocket 地址为 `ws://127.0.0.1:7090/collab`。

## 2. 生成可安装包

```bash
pnpm pack:packages
```

在 React 项目中安装生成的 `client-core`、`domain-json`、`protocol` tarball。正式批准发布后，等价命令为：

```bash
pnpm add @collabhub/client-core @collabhub/domain-json @collabhub/protocol
```

## 3. 新增一个协同模块

```ts
// src/collab/document-collaboration.ts
import { CollaborationStore } from '@collabhub/client-core'
import { applyCanonicalPatches } from '@collabhub/domain-json'
import type { JsonObject } from '@collabhub/protocol'

type DocumentState = JsonObject & { title: string }
type DocumentCommand = { type: 'document.rename'; title: string }

export function createDocumentCollaboration(documentId: string, actorId: string) {
  return new CollaborationStore<DocumentState, DocumentCommand>({
    url: 'ws://127.0.0.1:7090/collab',
    tenantId: 'demo',
    documentId,
    actorId,
    clientId: `${actorId}-${crypto.randomUUID()}`,
    schemaVersion: '1.0',
    initialState: { title: 'Untitled' },
    applyPatches: applyCanonicalPatches,
    adaptCommand: (command) => ({
      operation: {
        operationType: 'property.set',
        strategyId: 'json.property-lww',
        strategyVersion: '1.0',
        payload: { path: '/title', value: command.title },
      },
      optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
    }),
  })
}
```

## 4. React 组件只面向业务

通过应用 Runtime 传入 Store。组件只认识 `getSnapshot`、`subscribe` 和业务命令：

```tsx
function DocumentTitle({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
  )

  return (
    <input
      value={document.title}
      onChange={(event) => runtime.execute({
        type: 'document.rename',
        title: event.target.value,
      })}
    />
  )
}
```

已有 REST 应用继续保留自己的 `CommandTransport`，只在 composition root 选择 `RestTransport` 或 CollabHub transport。完整工程化 diff 见 [TODO List 接入](integration/todo-list-tutorial.md)。

## 5. 增加业务语义

内置 JSON 策略覆盖属性、实体和排序。联动规则与 invariant 放在服务端 Domain Pack；一个 operation 的多个 patch 共用一个 canonical version，其他客户端不会看到半完成状态。

生产接入前请阅读[能力矩阵](capabilities.md)、[接入条件](integration/readiness.md)和[已知限制](known-limitations.md)。
