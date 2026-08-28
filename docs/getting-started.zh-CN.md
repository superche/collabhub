# 给已有 React App 接入协同

默认路径只需要理解两个概念：

1. **中心权威服务**：负责 room 定序、WAL、snapshot 与恢复。
2. **React 协同 Store**：把业务 Command 映射为增量 JSON intent。

领域类型、React 组件和 REST fallback 仍由宿主拥有。

## 1. 部署服务

评估环境用 standalone 镜像和持久卷即可：

```bash
docker run --name collabhub -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
  -e COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
  -e COLLABHUB_INITIAL_STATE_JSON='{"title":"Untitled"}' \
  ghcr.io/superche/collabhub-standalone:0.1.1
```

容器暴露 `/collab` 与 `/healthz`，snapshot 和 WAL 保存在 `/data`。需要自定义 Domain Pack 时，复制[同一份 Dockerfile](../deploy/standalone.Dockerfile)。

显式开发身份只用于评估。生产部署必须实现 `authenticate`、租户/document 授权、TLS、备份和数据保留策略。

### 已有服务端文档

浏览器里的 `initialState` 只用于避免首屏为空，不会把数据导入中心权威。已有 REST 文档按下面的路径接入：

1. 在宿主服务中嵌入 `startJsonCollaborationServer`。
2. 用 `StorageAdapter.loadSnapshot` 从现有 repository 提供首份 canonical 文档，后续 WAL/snapshot 也经该 adapter 持久化。
3. 共享写统一经过协同 Command Gateway；REST 只能作为关闭协同时的 fallback，不能并发直写。
4. 一个命令需要校验 invariant 或原子联动多个字段时，再增加 Domain Pack。

[TODO List 迁移教程](integration/todo-list-tutorial.md)给出了完整实现。新文档或由 CollabHub 持有的数据仍优先使用 standalone 镜像。

## 2. 只安装一个 SDK 包

```bash
npm add @collabhub/client-core@0.1.1
```

如果应用默认使用私有 npm 镜像，请在其 `.npmrc` 中加入 `@collabhub:registry=https://registry.npmjs.org`。

新建 `src/collab/document-collaboration.ts`：

```ts
import { createCollaboration, json } from '@collabhub/client-core'
import type { AppCommand, AppDocument } from '../domain'

export function createDocumentCollaboration(options: {
  url: string
  documentId: string
  actorId: string
  initialState: AppDocument
}) {
  return createCollaboration<AppDocument, AppCommand>({
    ...options,
    command(command) {
      switch (command.type) {
        case 'document.rename': return json.set('/title', command.title)
        case 'item.add': return json.create('items', command.item.id, command.item)
        case 'item.delete': return json.delete('items', command.itemId)
        case 'item.move': return json.move('items', command.itemId, command.afterId)
      }
    },
  })
}
```

`json.*` 隐藏 operation envelope、strategy id、baseVersion、optimistic patch 与 canonical patch 应用。返回对象直接满足 `useSyncExternalStore` 的 `subscribe/getSnapshot` 形状。

## 3. 只改 composition root

```ts
export function createAppRuntime(options: RuntimeOptions): AppRuntime {
  if (!options.collaborationEnabled) return createRestRuntime(options)

  const collaboration = createDocumentCollaboration(options)
  return {
    subscribe: collaboration.subscribe,
    getSnapshot: collaboration.getSnapshot,
    execute: (command) => collaboration.execute(command),
    diagnostics: () => collaboration.diagnostics,
    close: () => collaboration.close(),
  }
}
```

React 组件继续只依赖 `AppRuntime`：

```tsx
function Title({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  return <input defaultValue={document.title} onBlur={(event) => runtime.execute({ type: 'document.rename', title: event.currentTarget.value })} />
}
```

## 业务字段需要联动时

内置 `json.*` 覆盖 LWW 属性、实体生命周期、列表排序和严格事务。一个命令需要更新多个派生字段时，客户端只发送一个 custom intent，由 Domain Pack 解析；返回的全部 patch 在一个 canonical version 中提交并广播。

[TODO List 迁移教程](integration/todo-list-tutorial.md)完整展示 REST fallback、command/projection adapter、联动更新、旧 intent 策略与 REST/Collab 防双写。

## 查看完整生成项目

```bash
npm create @collabhub/react@0.1.1 my-collab-app
cd my-collab-app
npm install
npm run dev
```

这是学习 fixture，不是产品默认假设。发布门禁会在全新目录安装它的两个 CollabHub 依赖，并用 Chromium 验证 Alice/Bob 同步。

生产接入前请阅读[接入条件](integration/readiness.md)、[架构说明](architecture/overview.md)和[已知限制](known-limitations.md)。
