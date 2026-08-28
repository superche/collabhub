<h1 align="center">CollabHub</h1>

<p align="center"><strong>给现有 React 应用外挂多人实时协同，改动少，随时可切回 REST。</strong></p>

<p align="center">
  保留你的数据结构、Store 和 React 组件，不要求迁移 CRDT。<br>
  协同代码集中在单独目录，不散落进业务页面。
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.3-1f6f4a">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="docs/getting-started.zh-CN.md">快速接入</a> ·
  <a href="https://collabhub-demo.onrender.com/demo.html">在线 Demo</a> ·
  <a href="#案例">案例</a> ·
  <a href="#接入案例">接入案例</a> ·
  <a href="docs/capabilities.md">能力矩阵</a>
</p>

| 你的项目继续保留 | CollabHub 新增 | 关闭协同 |
|---|---|---|
| 数据类型、Store、React 组件 | 一个前端接入文件、一个可部署服务 | 切回原来的 REST |

> **发布状态：** `0.1.3` 是面向结构化 React 状态的技术预览，不宣称生产级安全或多地域能力；`v1.0.0` 仍需仓库所有者批准。

已有 React App 只需要理解两件事：部署一个服务，在应用启动入口接入一个 SDK。连接、重连、数据恢复和多人消息都由 CollabHub 处理。

standalone 镜像适合新文档和快速试用。已有数据库也可以继续使用：通过 `StorageAdapter` 读取和保存数据，并在协同开启时停止旧 REST 接口直接写同一份数据。客户端 `initialState` 只负责连接前的首屏展示，不会把数据导入服务端。

## Features

| 能力 | 范围 |
|---|---|
| **接入改动少** | 保留现有数据类型、Store、组件和 REST 备用路径 |
| **联动一次完成** | 一次操作可以同时修改正文、数量、进度等多个字段，其他用户不会看到只改一半 |
| **冲突规则可自定义** | 同时编辑时，可以按业务选择接受、拒绝或要求重新加载 |
| **断线自动恢复** | 自动重连、重发未完成操作，并在需要时重新获取完整数据 |
| **常见操作内置** | 支持字段修改、数据增删和列表排序 |
| **可以水平扩容** | 提供 PostgreSQL / Redis 多节点运行方式 |
| **云部署基线** | 提供 AWS VM/RDS/ElastiCache 与阿里云 ECS/RDS/Tair Terraform |
| **在线状态单独发送** | 光标、选中项等临时消息不会写入文档历史 |
| **公网保护** | 支持登录校验、来源限制、连接数和消息频率限制 |
| **两步开始** | React 安装 `@collabhub/client-core`；服务部署 `@collabhub/server-ws` 或 standalone 镜像 |

## 案例

### 1. TODO List

经典 React 待办清单：保留原来的数据类型、Store、操作处理和 REST API，只在应用入口增加协同开关。

```bash
pnpm dev
```

| 进程 | 地址 |
|---|---|
| Server / REST / WebSocket | `http://127.0.0.1:4100` |
| Alice | `http://127.0.0.1:5173/?client=alice` |
| Bob | `http://127.0.0.1:5174/?client=bob` |

联动演示：Alice 勾选一项任务，只发一次操作；任务状态、完成数、任务总数和进度会一起更新，Bob 不会看到只更新一半的页面。

验证通过：字段联动、同时编辑处理、排序、断线恢复、REST/协同切换，以及协同开启时阻止 REST 绕过服务直接写。详见 [TODO List 接入说明](docs/integration/todo-list-tutorial.md)。

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

*双客户端冒烟：任务编辑、断线恢复与排序。*

### 2. BlockNote

BlockNote 保持原来的编辑器用法，通过单独的接入文件连接 CollabHub，不启用内置 Yjs provider。

```bash
pnpm dev:blocknote
```

| 进程 | 地址 |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4200` |
| Alice | `http://127.0.0.1:5183/?client=alice` |
| Bob | `http://127.0.0.1:5184/?client=bob` |

验证通过：块级富文本更新、块增删、块排序、连续输入合并、断线重放与 snapshot recovery。同一顶层 Block 的并发文本是 LWW，不是字符级 CRDT 合并。详见 [BlockNote 接入说明](docs/integration/blocknote.md)。

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

*双客户端冒烟：富文本输入、断线恢复与块排序。*

### 3. React Flow

React Flow 作为受控画布接入；宿主继续持有与渲染器无关的 `GraphDocument`。

```bash
pnpm dev:react-flow
```

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/superche/collabhub)

[打开在线 Alice/Bob React Flow Demo](https://collabhub-demo.onrender.com/demo.html)

免费部署让两个 React Flow 页面编辑同一张图；有人在线时房间会保留，所有人断开 30 分钟后清理，最多保留 500 个空闲房间。Demo 状态仅保存在内存。详见 [Demo 部署](docs/demo.md)。
打开[单客户端 Demo](https://collabhub-demo.onrender.com/)会在 `?document=...` 中生成 room ID；分享该 URL 即可邀请其他客户端。

| 进程 | 地址 |
|---|---|
| Server / WebSocket | `http://127.0.0.1:4300` |
| Alice | `http://127.0.0.1:5193/?client=alice` |
| Bob | `http://127.0.0.1:5194/?client=bob` |

验证通过：节点/边增量编辑、拖拽松手单次提交、断线重放，以及删除节点时原子删除关联边。详见 [React Flow 接入说明](docs/integration/react-flow.md)。

https://github.com/user-attachments/assets/40594baa-6181-4e9f-a227-4d650c8eac35

*双客户端冒烟：节点编辑、拖拽合并、断线恢复与关联边联动删除。*

## 接入案例

假设你已经有一个 React 项目：页面从 `AppRuntime` 读取数据，用户点击按钮时调用 `runtime.execute(command)`。接入后，页面组件不用 import CollabHub，也不用重写你的数据类型。

你只需要做三件事：启动服务、把业务操作翻译成数据修改、在应用启动时选择协同或原来的 REST。

### 1. 启动协同服务

先在本机跑起来：

```bash
docker run --name collabhub -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=http://localhost:5173 \
  -e COLLABHUB_ALLOW_INSECURE_DEVELOPMENT_IDENTITY=true \
  -e COLLABHUB_INITIAL_STATE_JSON='{"title":"Untitled","cards":[]}' \
  ghcr.io/superche/collabhub-standalone:0.1.3
```

浏览器连接 `ws://localhost:4100/collab`。数据保存在 Docker 卷 `collabhub-data`，重启容器不会丢。

上面的 `COLLABHUB_INITIAL_STATE_JSON` 适合新项目试用。如果你的数据已经在数据库里，请让服务通过 `StorageAdapter` 读取和保存原数据；不要让 REST 和协同服务同时修改同一份数据。完整做法见[已有服务端数据接入](docs/getting-started.zh-CN.md#已有服务端文档)。

### 2. 在 React 项目里加一个协同文件

```bash
npm add @collabhub/client-core@0.1.3
```

新建 `src/collab/create-collab-runtime.ts`。这里唯一要做的事，就是告诉 CollabHub：你的每种操作会改哪份数据。

```tsx
import { createCollaboration, json } from '@collabhub/client-core'
import type { AppCommand, AppDocument, AppRuntime } from '../app/types'

export function createCollabRuntime(options: {
  wsUrl: string
  documentId: string
  userId: string
  initialDocument: AppDocument
}): AppRuntime {
  const collab = createCollaboration<AppDocument, AppCommand>({
    url: options.wsUrl,
    documentId: options.documentId,
    actorId: options.userId,
    initialState: options.initialDocument,
    command(command) {
      switch (command.type) {
        case 'document.rename': return json.set('/title', command.title)
        case 'card.add': return json.create('cards', command.card.id, command.card)
        case 'card.delete': return json.delete('cards', command.cardId)
        case 'card.move': return json.move('cards', command.cardId, command.afterId)
        default: throw new Error(`还没有接入这个操作：${command.type}`)
      }
    },
  })

  return {
    subscribe: collab.subscribe,
    getSnapshot: () => collab.getSnapshot() as AppDocument,
    execute: (command) => collab.execute(command),
    close: () => collab.close(),
  }
}
```

常见操作已经准备好了：

| 你的操作 | 写法 |
|---|---|
| 改字段 | `json.set('/title', value)` |
| 新增一条数据 | `json.create('cards', id, card)` |
| 删除一条数据 | `json.delete('cards', id)` |
| 调整顺序 | `json.move('cards', id, afterId)` |

连接、断线重连和重新拿数据都由 SDK 处理。

### 3. 在应用启动时选择协同或原来的 REST

```tsx
const runtime = import.meta.env.VITE_COLLAB_ENABLED === 'true'
  ? createCollabRuntime({
      wsUrl: 'ws://localhost:4100/collab',
      documentId: 'project-123',
      userId: currentUser.id,
      initialDocument,
    })
  : createRestRuntime() // 你原来的实现

createRoot(document.getElementById('root')!).render(<App runtime={runtime} />)
```

你的组件不需要知道当前走哪种方式：

```tsx
import { useSyncExternalStore } from 'react'

function App({ runtime }: { runtime: AppRuntime }) {
  const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)

  return <button onClick={() => runtime.execute({
    type: 'document.rename',
    title: '新的标题',
  })}>{document.title}</button>
}
```

关闭 `VITE_COLLAB_ENABLED` 就会切回原来的 REST。组件、`AppDocument` 和 `AppCommand` 都不用改。

### 4. 自定义逻辑写在哪里

| 你想做什么 | 写在哪里 |
|---|---|
| 增加一种普通的增删改或排序 | `src/collab/create-collab-runtime.ts` 的 `switch` |
| 一次操作要联动修改多个字段 | 服务端的 `server/app-domain-pack.ts` |
| 检查内容是否合法 | `server/app-domain-pack.ts` |
| 决定旧操作是继续执行还是拒绝 | `server/app-domain-pack.ts` |
| 检查用户是否能打开或修改文档 | 服务启动文件里的 `authenticate` |
| 把数据存进你自己的数据库 | 服务端的 `StorageAdapter` |

例如“改标题时，同时更新最后修改时间”，客户端只发一次操作：

```ts
// src/collab/create-collab-runtime.ts
return json.custom({
  operationType: 'document.renameAndTouch',
  strategyId: 'app.rename-and-touch',
  strategyVersion: '1.0',
  payload: { title: command.title },
})
```

真正的联动规则放在服务端，所以所有用户都会得到同一个结果：

```ts
// server/app-domain-pack.ts
const renameAndTouch = {
  id: 'app.rename-and-touch',
  version: '1.0',
  supports: (type: string) => type === 'document.renameAndTouch',
  resolve({ operation }: any) {
    const { title } = operation.payload
    if (!title.trim()) {
      return { kind: 'reject', reason: { code: 'emptyTitle', message: '标题不能为空' } }
    }
    return {
      kind: 'accept',
      patches: [
        { op: 'set', path: '/title', value: title },
        { op: 'set', path: '/updatedAt', value: new Date().toISOString() },
      ],
    }
  },
}
```

把它加入服务端的 `strategies` 数组即可。这份服务端规则配置在代码里叫 `Domain Pack`。完整可运行代码见 [TODO List](examples/todo-list-app/server/draft-domain-pack.ts)，更详细的步骤见[已有 React App 接入](docs/getting-started.zh-CN.md)。

无论使用单机还是分布式镜像，业务规则都不必编译进 CollabHub：

- 用 `COLLABHUB_DOMAIN_PACK_CONFIG` 挂载 JSON，配置初始结构、内置策略和旧操作处理；
- 用 `COLLABHUB_DOMAIN_PACK_MODULE` 挂载经过审查的 ESM 文件，编写联动字段、校验和自定义解冲突。

详见[外挂 Domain Pack](docs/deployment/domain-pack.md)。同一份文件可用于本地 Docker；AWS 和阿里云配置会把它只读分发到每个 Gateway 和 Worker。

如需查看完整生成项目：

```bash
npm create @collabhub/react@0.1.3 my-collab-app
```

## 仓库结构

```text
packages/
  protocol/           协议与 wire types
  client-core/        pending、重连与 recovery
  server-core/        定序、pipeline、WAL 与 snapshot
  server-ws/          单机 WebSocket Adapter 与 room 生命周期
  server-distributed/ PostgreSQL / Redis 多节点 runtime
  strategy-sdk/       Strategy 与 Domain Pack SPI
  domain-json/        默认 JSON strategies
  testkit/            trace 与 conformance helpers
  create-react/       面向全新 React 项目的 npm create starter
examples/
  todo-list-app/      REST baseline 与协同接入样板
  blocknote-app/      BlockNote 增量块协同适配
  react-flow-app/     React Flow 增量图协同适配
deploy/
  docker/             分布式、单机与 Demo 镜像
  local/              本地 PostgreSQL/Redis 集群
  kubernetes/         云中立 Kustomize base
  aws/ alicloud/      VM + 托管数据库 Terraform
docs/                 架构、接入与验收文档
```

## 开发手册

要求 Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm dev                # TODO List server + Alice + Bob
pnpm dev:blocknote      # BlockNote server + Alice + Bob
pnpm dev:react-flow     # React Flow server + Alice + Bob
pnpm check              # build + tests + benchmark
pnpm test:e2e           # 双浏览器回归验收
pnpm smoke:demo         # 生产 bundle + 双窗口公开 Demo
pnpm smoke:fresh-react  # 打包、npm 安装、构建并双客户端同步全新 starter
pnpm release:check      # 包元数据、ESM/types、tarball 审计

# 本机独立进程：2 Gateway + 2 Worker + 2 TODO List 前端
pnpm dev:todo-cluster
pnpm smoke:todo-cluster # worker 故障迁移、联动更新、离线重放

# 全容器分布式 runtime
docker compose -f deploy/local/docker-compose.yml up --build -d
pnpm smoke:distributed
```

录制命令：`pnpm record:todo-list`、`pnpm record:blocknote`、`pnpm record:react-flow`。

## 文档

- [React 快速接入](docs/getting-started.zh-CN.md)
- [能力矩阵](docs/capabilities.md)
- [免费公开 Demo](docs/demo.md)
- [架构](docs/architecture/overview.md)
- [协议与 Pipeline](docs/architecture/protocol.md)
- [水平扩容与云部署](docs/architecture/horizontal-scaling.md)
- [AWS VM 部署](deploy/aws/README.zh-CN.md) · [阿里云 VM 部署](deploy/alicloud/README.zh-CN.md)
- [JSON 配置与 ESM 外挂 Domain Pack](docs/deployment/domain-pack.md)
- [本地多进程 TODO List 冒烟](docs/acceptance-local-process-cluster.md)
- [接入条件](docs/integration/readiness.md)
- [TODO List 接入](docs/integration/todo-list-tutorial.md)
- [BlockNote 接入](docs/integration/blocknote.md)
- [React Flow 接入](docs/integration/react-flow.md)
- [验收记录](docs/acceptance.md)
- [已知限制](docs/known-limitations.md)
- [发布流程](docs/releasing.md)
- [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md) · [变更记录](CHANGELOG.md)

## License

[Apache-2.0](LICENSE)。BlockNote example 的 `@blocknote/*` 依赖使用 MPL-2.0。
