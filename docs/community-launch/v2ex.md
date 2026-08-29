# V2EX「分享创造」发布工作稿

V2EX 的社区规则明确要求不要发送 AI 生成内容。这个文件只提供事实、结构和检查项；发布者需要用自己的语言写最终正文，不能整段复制本文件或其他生成稿。

## 标题方向

请自行改写后选择一个：

- `[开源] 给已有 React 项目外挂多人协同，不重写原来的业务模型`
- `[分享创造] 我做了一个给现有 React 应用接入多人协同的开源项目`
- `现有 React 项目怎么低成本增加多人协同？这是我的开源实现`

## 用自己的经历补全这四点

发布前亲自写下答案，每点两到四句话：

1. 我为什么开始做 CollabHub？我在什么项目或场景里看到这个问题？
2. 现有方案最让我不满意的接入成本是什么？
3. 我为了证明它真的能接入旧项目，做了哪些例子和故障验证？
4. 我最想让 V2EX 用户帮忙判断什么？

## 建议结构

### 1. 问题

说明目标用户已经有 React 组件、状态管理、业务命令、REST API 和数据库，只是希望增加多人实时协同。

### 2. 做法

用自己的语言说明：

- 原来的组件和业务数据继续保留。
- 接入一个 React SDK，并部署一个开源服务。
- 自定义业务逻辑集中写在 `collabhub.model.ts`。
- 同一个命令可以一起修改多个关联字段，其他客户端会整体收到结果。
- 协同关闭时仍然可以走原来的 REST 实现。

可使用这段事实性代码示例：

```ts
export const collabModel = defineCollaborationModel({
  reduce(draft, command) {
    if (command.type === 'task.completed') {
      draft.tasks.find(task => task.id === command.taskId)!.done = true
      draft.completedCount = draft.tasks.filter(task => task.done).length
    }
  },
  validate: document =>
    document.completedCount <= document.tasks.length || 'invalid completed count',
})
```

### 3. 已完成的验证

可以核对后描述这些事实：

- TODO List：关联字段、排序、离线恢复和 REST 回退。
- BlockNote：块级增删、排序和恢复；同一块内不是字符级合并。
- React Flow：节点移动合并、边联动删除、双客户端和断线重连。
- Docker 单机启动，以及 PostgreSQL + Redis 的持久化/多节点方案。

### 4. 主动说清限制

- 当前重点是结构化业务数据，不是字符级富文本 OT/CRDT。
- 富文本正文可以由 Yjs 负责，CollabHub 负责标题、状态和工作流。
- Render 是公开 Demo，不代表托管服务 SLA。

### 5. 链接

- 在线体验：https://collabhub-demo.onrender.com/demo.html
- GitHub：https://github.com/superche/collabhub
- 五分钟接入：https://github.com/superche/collabhub/blob/main/docs/getting-started.zh-CN.md
- AI Coding 指南：https://github.com/superche/collabhub/blob/main/docs/ai-coding-guide.md

### 6. 最后只问一个问题

建议围绕真实接入成本提问，例如：

> 如果你把它接到一个已经上线的 React 项目里，第一处让你不敢继续的地方会是什么？

## 发布前检查

- [ ] 最终正文由发布者本人重写，符合个人真实经历。
- [ ] 发布到「分享创造」，不跨节点重复发布。
- [ ] 补充个人头像。
- [ ] 不要求点赞、Star 或转发。
- [ ] 不使用“颠覆”“零成本”“生产级万能方案”等无法证明的表述。
- [ ] 发布后持续回答问题，并把可复现问题转成 GitHub Issue。
