# React 快速接入

CollabHub 保留你的 React 组件和领域模型，只把协同放进一个 adapter 与 composition root。

## 最快方式：生成可运行项目

```bash
npm create @collabhub/react@0.1.0 my-collab-app
cd my-collab-app
npm install
npm run dev
```

它会启动一个单机中心权威服务和 Alice、Bob 两个客户端。打开 `http://127.0.0.1:5173/?client=alice` 和 `http://127.0.0.1:5174/?client=bob`，在任一窗口修改标题即可验证同步。

生成项目包含：

- 面向业务、基于 `useSyncExternalStore` 的 React Store；
- 增量 `property.set`，热路径不提交整个文档；
- pending、重连、canonical version 与诊断状态；
- 默认安全的服务端 adapter；本地开发必须显式开启不安全身份模式。

发布门禁会在临时目录运行同一个生成器，只安装打包后的公共包，完成构建并用 Chromium 验证 Alice/Bob 同步：

```bash
pnpm smoke:fresh-react
```

## 接入已有 React 项目

安装客户端包：

```bash
npm add @collabhub/client-core @collabhub/domain-json @collabhub/protocol
```

在组件外新增一个协同 adapter：

```ts
// src/collab/document-collaboration.ts
import { CollaborationStore } from '@collabhub/client-core'
import { applyCanonicalPatches } from '@collabhub/domain-json'

export const documentStore = new CollaborationStore({
  url: 'ws://localhost:4100/collab',
  tenantId: 'example',
  documentId: new URLSearchParams(location.search).get('document') ?? 'welcome',
  actorId: crypto.randomUUID(),
  clientId: crypto.randomUUID(),
  schemaVersion: '1.0',
  initialState: { title: 'Untitled' },
  applyPatches: applyCanonicalPatches,
  adaptCommand: (command: { type: 'rename'; title: string }) => ({
    operation: {
      operationType: 'property.set',
      strategyId: 'json.property-lww',
      strategyVersion: '1.0',
      payload: { path: '/title', value: command.title },
    },
    optimisticPatches: [{ op: 'set', path: '/title', value: command.title }],
  }),
})
```

React 组件只依赖自己的应用 Runtime：

```tsx
function Title({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

  return (
    <input
      defaultValue={document.title}
      onBlur={(event) => runtime.execute({ type: 'rename', title: event.currentTarget.value })}
    />
  )
}
```

已有 REST 应用可继续保留自己的 `CommandTransport`，只在 composition root 选择 REST 或 CollabHub transport。完整工程化迁移见 [TODO List 教程](integration/todo-list-tutorial.md)。

## 启动单机服务

```bash
npm add @collabhub/server-ws @collabhub/domain-json
```

```ts
import { createJsonDomainPack } from '@collabhub/domain-json'
import { startStandaloneWebSocketServer } from '@collabhub/server-ws'

const server = await startStandaloneWebSocketServer({
  port: 4100,
  domainPack: createJsonDomainPack(),
  authenticate: async ({ authToken }) => verifyYourToken(authToken),
})
```

`authenticate` 必须返回可信的 `tenantId`、`actorId` 与允许访问的 document IDs。本地示例可以显式开启 `allowInsecureDevelopmentIdentity`，生产环境不会意外降级。

字段联动或 invariant 放进 Domain Pack strategy；一个 accepted operation 的多个 patch 共享一个 canonical version。

生产接入前请阅读[接入条件](integration/readiness.md)、[架构说明](architecture/overview.md)和[已知限制](known-limitations.md)。
