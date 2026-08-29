<h1 align="center">CollabHub</h1>

<p align="center"><strong>不替换现有数据模型，给已有 React 项目外挂多人协同。</strong></p>

<p align="center">保留组件、Store、业务命令和 REST 兜底；只增加一个共享规则文件、一个 React SDK 和一个可部署服务。</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.0-2563eb">
  <a href="https://github.com/superche/collabhub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/superche/collabhub/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/@collabhub/client-core"><img alt="npm" src="https://img.shields.io/npm/v/@collabhub/client-core?logo=npm"></a>
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-4c566a">
</p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

<p align="center">
  <a href="https://collabhub-demo.onrender.com/demo.html">React Flow 在线演示</a> ·
  <a href="docs/getting-started.zh-CN.md">5 分钟接入</a> ·
  <a href="docs/ai-coding-guide.md">AI Coding 指南</a> ·
  <a href="deploy/README.md">部署</a> ·
  <a href="llms.txt">llms.txt</a>
</p>

> **v1.0：** 面向结构化 React 协同的稳定 API。登录、文档权限、业务规则和业务数据库仍由你的应用管理。

## Features

- **侵入少：** React 组件不依赖 CollabHub；启动时可切回原有 REST。
- **写业务命令即可：** 用熟悉的 reducer 风格写规则，服务端会重新执行并校验。
- **联动一次同步：** 一条命令可以同时更新内容、计数和进度，其他客户端不会看到半成品。
- **并发体验更好：** 旧命令默认在最新数据上重跑；也能按命令选择拒绝或重新加载。
- **自动恢复：** 重连、快照恢复、幂等重试、背压，以及 IndexedDB 待提交队列。
- **典型场景：** 字段修改、实体增删、列表排序、React Flow 和块编辑器。
- **可部署：** 单机 Docker 用于试用；AWS 持久化单机版 **$12/月起**；PostgreSQL + Redis 与 Kubernetes 用于多节点生产。

## 案例

### 1. TODO List

经典 React 领域模型、Store、Command Bus 和 REST 兜底。演示进度联动、排序、离线恢复和防双写。[代码](examples/todo-list-app) · [接入说明](docs/integration/todo-list-tutorial.md)

https://github.com/user-attachments/assets/58963835-fffe-43ff-875b-617e635ec282

### 2. BlockNote

保留 BlockNote 编辑器 API，按块协同。演示增删、排序、输入合并、离线重放和恢复。同一块内的并发文本是 LWW，不是字符级 CRDT 合并。[代码](examples/blocknote-app) · [接入说明](docs/integration/blocknote.md)

https://github.com/user-attachments/assets/6a90ca9d-ef9b-4d1b-a105-2e542c80b189

### 3. React Flow

React Flow 只是受控画布，业务仍保留自己的 `GraphDocument`。演示节点/边增量更新、拖拽合并、离线重放和关联边删除。[在线演示](https://collabhub-demo.onrender.com/demo.html) · [代码](examples/react-flow-app) · [接入说明](docs/integration/react-flow.md)

https://github.com/user-attachments/assets/cc5117cb-3bff-49fd-82f9-bb1f8ece80bb

### 4. CollabHub + Yjs

有些应用既有结构化业务数据，又有需要字符级协同的富文本正文，一套同步方式很难同时适合两者。CollabHub 负责业务字段和流程，Yjs 负责正文，每个字段只交给一套系统管理。[代码](examples/yjs-hybrid-app) · [接入说明](docs/integration/yjs-hybrid.zh-CN.md)

## 接入案例

### 给已有 React 项目增加协同

```bash
npx @collabhub/create-react@1.0.0 init .
npm install
npm run collabhub:doctor
```

命令只增加接入文件，不修改现有 React 组件。大多数项目只需改 `collabhub.model.ts`：

```ts
import { defineCollaborationModel } from '@collabhub/client-core'

export const collabModel = defineCollaborationModel<AppDocument, AppCommand>({
  id: 'my-app',
  initialState: documentId => loadEmptyDocument(documentId),

  // 继续使用已有业务命令，像写 reducer 一样改草稿。
  reduce(draft, command) {
    if (command.type === 'task.completed') {
      draft.tasks.find(task => task.id === command.taskId)!.done = true
      draft.completedCount = draft.tasks.filter(task => task.done).length
      draft.progress = draft.completedCount / draft.tasks.length
    }
  },

  // 自定义校验写在这里，服务端也会检查。
  validate: document => document.progress <= 1 || '进度不合法',

  // 默认 rebase：旧命令在最新数据上重跑。敏感操作可以直接拒绝。
  stale: command => command.type === 'invoice.paid' ? 'reject' : 'rebase',
})
```

生产环境里，业务后端给当前用户和文档返回短期 token；SDK 每次连接和重连都会重新获取，token 过期不需要重新构建前端。CollabHub 可以使用一条只放在后端的共享密钥验签。项目已经使用 Clerk、Auth0、Supabase 等能提供 JWKS 的登录服务时，可以直接复用。

```ts
const getAuthToken = async () => {
  const response = await fetch('/api/collabhub/token', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ documentId }),
  })
  return (await response.json()).token
}
```

只在应用启动、选择 Store/API 实现的位置创建协同运行时：

```tsx
const runtime = collaborationEnabled
  ? createModelCollaboration({
      url: 'wss://collab.example.com/collab',
      documentId,
      actorId: currentUser.id,
      getAuthToken,
      model: collabModel,
      initialState: collabModel.initialState(documentId),
    })
  : createRestRuntime()
```

原来的组件仍然读取状态、发送业务命令：

```tsx
const document = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
runtime.execute({ type: 'task.completed', taskId })
```

启动服务，并做一次真实的双客户端联动验证：

```bash
npm run collabhub:server
npm run collabhub:verify
```

已有数据库数据通过 `StorageAdapter` 读写；协同会话期间必须阻止 REST 写同一份文档。详见[已有数据接入](docs/getting-started.zh-CN.md#已有数据)和[生产检查](docs/integration/readiness.md)。

### 部署服务

```bash
docker run -p 4100:4100 -v collabhub-data:/data \
  -e COLLABHUB_ALLOWED_ORIGINS=https://app.example.com \
  -e COLLABHUB_AUTH_TOKEN=replace-me \
  ghcr.io/superche/collabhub-standalone:1.0.0
```

单机版用于试用和小规模部署。[AWS 方案](deploy/aws)使用 Lightsail 部署持久化独立开发者栈，**$12/月起**。需要多节点故障切换时，使用云无关的[已有 VM 部署](deploy/vm)或 [Kubernetes](deploy/kubernetes)，外接 PostgreSQL 和 Redis。[阿里云](deploy/alicloud)保留为已认证的云环境。[Render](render.yaml) 是真实公网 Demo，但内存存储不作为持久化参考。

### CollabHub 还是 Yjs？

已有结构化 React 数据、业务命令、服务端校验和数据库时，选 CollabHub。字符级富文本、local-first 和离线多副本合并时，选 Yjs。混合项目可以让 CollabHub 管业务对象，让 Yjs 管富文本字段。[可运行案例](examples/yjs-hybrid-app) · [接入说明](docs/integration/yjs-hybrid.zh-CN.md) · [详细对比](docs/choosing-collabhub-or-yjs.md)

## 仓库结构

```text
packages/       协议、客户端 SDK、共享模型、服务端、策略、测试工具
examples/       TODO List、BlockNote、React Flow、CollabHub + Yjs
deploy/         Docker、已有 VM、Kubernetes、AWS、阿里云
docs/           接入、架构、运维、验收
scripts/        冒烟、性能基线、发布检查
```

## 开发手册

```bash
pnpm install
pnpm check
pnpm dev:react-flow
```

`pnpm check` 会构建所有包和案例、运行测试并记录性能基线。另见[架构](docs/architecture/overview.md)、[发布流程](docs/releasing.md)和[验收证据](docs/acceptance.md)。

## 文档

- [快速接入](docs/getting-started.zh-CN.md)
- [AI Coding 接入指南](docs/ai-coding-guide.md)
- [能力边界](docs/capabilities.md)
- [部署](deploy/README.md)
- [生产硬化](docs/production-hardening.zh-CN.md)
- [水平扩容](docs/architecture/horizontal-scaling.md)
- [已知限制](docs/known-limitations.md)
- [API 稳定性](docs/api-stability.zh-CN.md)
- [v1.0 发布说明](docs/release-notes-1.0.0.md)

## License

[Apache License 2.0](LICENSE)
