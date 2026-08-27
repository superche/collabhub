# TODO List：从 REST baseline 到协同

这个 example 先是一个经典中心化 React 待办清单，不是 collab-native demo。

项目入口名为 `todo-list-app`；内部 `Draft*` 是宿主已有领域命名，CollabHub 接入不要求重命名领域模型。

## Baseline

`DraftDocument`、`DraftCommand` 与 `applyDraftCommand` 在 `src/domain`；`DraftStore` 与 `DraftCommandBus` 在 `src/application`；`RestDraftTransport` 调用：

```text
GET  /api/drafts/:id
POST /api/drafts/:id/commands
PUT  /api/drafts/:id
```

用 `http://127.0.0.1:5173/?collab=0` 可直接运行 baseline。domain tests 不需要 CollabHub。

## 协同接入 diff

必须新增的代码面：

1. `DraftCommandTransport` 保持为应用 port；composition root 在 REST/Collab 实现间选择。
2. `draft-command-adapter.ts` 将每个 DraftCommand 集中映射为 operation + 可丢弃的 optimistic patch。
3. `draft-projection-adapter.ts` 将 canonical patches 投影回原 DraftDocument，并保持 section 排序。
4. `collabhub-draft-transport.ts` 托管 Client Core 的连接/reject/resync 状态机。
5. `DraftDomainPack` 组合内置 JSON 策略、服务端业务策略与 Draft invariants，不修改 Server Core。
6. `DraftRepositoryStorageAdapter` 让 WAL commit 更新原中心 DraftRepository。
7. Draft API 在存在协同 writer 时拒绝直接写，避免 split brain。

不应修改的代码面：React components、DraftDocument schema、Draft reducer、DraftStore 的业务接口。

## 新增业务 operation

若新增 `section.lock`：

- 在 Draft Domain 增加命令和业务规则；
- 在 command adapter 增加映射；
- 在 DraftDomainPack 注册 strategy/invariant；
- 在 projection adapter 支持对应 canonical patch（若现有 patch 不足）。

不需要修改 WebSocket gateway、AuthoritativeDocumentSession、Client Core 或 React 组件的协同状态机。

## 服务端权威联动

勾选任务时，React 仍只发送原业务命令：

```ts
commandBus.execute({
  type: 'section.setCompleted',
  sectionId: 'intro',
  completed: true,
})
```

`draft-command-adapter.ts` 将其映射为 `section.setCompleted@draft.section-command`。服务端 strategy 使用当前 canonical `DraftDocument` 执行相同领域规则，生成：

```text
entityUpsert sections/:id.completed
set /completion/completed
set /completion/total
set /completion/percent
set /revision
```

这些 patch 共用一个 `operationId` 和 canonical version，一起通过 invariant、WAL 与广播。并发勾选会在服务端最新状态上重新计算汇总；optimistic patches 只负责即时反馈，不能成为权威结果。

## 退出协同

UI toggle 调用 composition root 的 `setCollaboration(false)`：关闭 socket、卸载 Collab transport、创建 RestDraftTransport 并让相同 DraftCommandBus 继续工作。全部协同连接离开后，REST writer gate 自动解除。
