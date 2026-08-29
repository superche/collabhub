# 给已有 React App 接入协同

CollabHub 只接在 Store/API 边界。组件继续读取原来的文档、发送原来的业务命令。

## 1. 生成接入文件

在 React 项目根目录执行：

```bash
npx @collabhub/create-react@1.0.0 init .
npm install
npm run collabhub:doctor
```

| 文件 | 用途 |
|---|---|
| `collabhub.model.ts` | 文档类型、命令、字段联动、校验、旧命令处理方式 |
| `src/collab/collabhub.ts` | 浏览器连接和 React Store |
| `server/collabhub.ts` | 使用同一份规则的 WebSocket 服务 |
| `Dockerfile.collabhub` | 当前应用的协同服务镜像 |

命令不会修改 `App.tsx` 或其他组件。

## 2. 修改规则文件

把示例类型替换成应用已有的文档和命令类型。每个 `reduce` 分支对应一条现有业务命令。

```ts
export const collabModel = defineCollaborationModel<Project, ProjectCommand>({
  id: 'project',
  initialState: id => ({ id, tasks: [], completed: 0 }),
  reduce(draft, command) {
    if (command.type === 'task.toggled') {
      const task = draft.tasks.find(item => item.id === command.taskId)
      if (!task) throw new Error('任务不存在')
      task.done = !task.done
      draft.completed = draft.tasks.filter(item => item.done).length
    }
  },
  validate: project => project.completed <= project.tasks.length || '完成数不合法',
  stale: command => command.type === 'payment.captured' ? 'reject' : 'rebase',
})
```

浏览器先执行 `reduce`，页面立即响应；服务端会在最新文档上重新执行、运行 `validate`、保存结果，并只把变化字段发给所有客户端。

旧命令默认使用 `rebase`。支付等一次性操作使用 `reject`；必须先刷新页面再重试的操作使用 `resync`。

## 3. 在应用启动处切换

让生成的 CollabHub Store 实现当前 REST Store 的接口，只在 composition root 选择一次：

```ts
const runtime = flags.collaboration
  ? createAppCollaboration(documentId, currentUser.id)
  : createRestRuntime(documentId)
```

组件无需修改：

```tsx
const project = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
await runtime.execute({ type: 'task.toggled', taskId })
```

## 4. 启动和验证

```bash
npm run collabhub:server
npm run collabhub:verify
```

`verify` 会创建一个新房间，连接两个独立 WebSocket 客户端，由 Alice 提交命令，再确认 Bob 收到服务端计算的联动字段。项目还应为真实命令、断线重连和 pending 清零增加双浏览器测试。

## 已有数据

`initialState` 只表示新文档或加载阶段的形状。已有数据库记录需要：

1. 用服务端 `StorageAdapter` 读取和保存。
2. WebSocket 使用业务登录后的 tenant、document、actor 身份。
3. 房间有协同 writer 时，REST `PUT/PATCH` 必须拒绝写同一份文档。
4. 如有需要，保留 REST 读取或只读投影。

单机 Docker 在挂载卷保存 snapshot/WAL，适合试用或单节点。多节点生产使用 PostgreSQL + Redis。见[部署说明](../deploy/README.md)。

## 上线检查

- WSS/TLS 和短期鉴权 token
- Origin 白名单和网关限流
- 持久化、备份、保留策略和 room 容量
- 连接、pending、拒绝、重载、队列延迟监控
- 部署后的双客户端冒烟
- [完整检查表](integration/readiness.md)
