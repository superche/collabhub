# CollabHub + Yjs：业务数据与字符级正文

已有 React 项目既有业务字段、又有富文本正文时，可以使用这个组合。

## 核心规则

每个字段只能有一个写入方：

| 数据 | 由谁负责 | 原因 |
|---|---|---|
| 标题、状态、权限、工作流 | CollabHub | 保留服务端规则和已有数据库 |
| 文档正文 | Yjs | 合并字符级并发编辑和离线修改 |

不要再用 CollabHub `set` 命令同步 Yjs 正文。同一字段由两套系统写入，会产生两份无法对齐的历史。

## 业务模型

CollabHub 模型故意不包含 `body`：

```ts
export const documentMetadataModel = defineCollaborationModel({
  id: 'my-app.metadata',
  initialState: documentId => ({ documentId, title: '未命名', status: 'draft' }),
  reduce(draft, command) {
    if (command.type === 'metadata.titleChanged') draft.title = command.title
    if (command.type === 'metadata.statusChanged') draft.status = command.status
  },
  validate: document => document.title.trim() ? true : '标题不能为空',
})
```

标题和状态使用普通 CollabHub runtime：

```ts
const metadata = createModelCollaboration({
  url: 'wss://collab.example.com/collab',
  documentId,
  actorId: currentUser.id,
  model: documentMetadataModel,
  initialState: documentMetadataModel.initialState(documentId),
})
```

## 字符级正文

正文创建一个 Yjs 文档；所有客户端根据相同文档 ID 得到相同房间名：

```ts
const ydoc = new Y.Doc()
const body = ydoc.getText('body')
const provider = new WebsocketProvider(
  'wss://yjs.example.com',
  `${documentId}:body`,
  ydoc,
)
```

然后使用编辑器官方的 Yjs binding 连接 `body`。可运行案例为了保持代码直白，使用 textarea，并把每次输入转换成最小的 `Y.Text` 删除/插入操作。正式富文本编辑器应使用官方 binding，正确处理选区、中文输入法、样式和 undo。

## 运行案例

```bash
pnpm install
pnpm dev:yjs-hybrid
```

打开：

- `http://127.0.0.1:5193/?document=hybrid-demo&client=alice`
- `http://127.0.0.1:5194/?document=hybrid-demo&client=bob`

修改标题或工作流是在验证 CollabHub；两边同时输入正文是在验证 Yjs 字符合并。

案例内的 Yjs WebSocket 服务是内存开发服务。生产环境需要选择支持持久化和扩容的 Yjs provider；CollabHub 与 Yjs 连接应使用相同的用户身份鉴权，并从同一个已授权 document ID 派生房间名。

[完整代码](../../examples/yjs-hybrid-app)
