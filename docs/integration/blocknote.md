# BlockNote 接入验证

## 结论

可以接入。BlockNote 保持编辑器职责，CollabHub 负责服务端定序、canonical state、断线恢复与广播；无需启用 BlockNote 的 Yjs provider。

```text
BlockNote onChange
  -> BlockNote change adapter
  -> block.insert | block.update | block.delete | block.move
  -> CollabHub Client Core
  -> BlockDocument Domain Pack
  -> canonical block patch
  -> BlockNote projection
```

BlockNote 官方协作方案基于 Yjs；本示例改用其公开的 `editor.document`、`onChange` 与块操作 API，验证 CollabHub 的 server-authoritative 路线。参考：[Collaboration](https://www.blocknotejs.org/docs/features/collaboration)、[Manipulating Blocks](https://www.blocknotejs.org/docs/reference/editor/manipulating-content)。

## 边界

| 层 | 依赖 |
|---|---|
| `src/components` | React、BlockNote、应用 Runtime 接口 |
| `src/domain` | 通用 BlockDocument；不依赖 BlockNote 或 CollabHub |
| `src/collab` | BlockNote ↔ operation / canonical patch adapter |
| `server` | 通用 Block JSON Domain Pack；不依赖 BlockNote |

Import boundary 测试会阻止 `components/application/domain` 引入 `@collabhub/*`，并阻止 canonical domain/server pack 引入 `@blocknote/*`。

## Operation 映射

| BlockNote 变化 | CollabHub operation | canonical patch |
|---|---|---|
| 新块 | `block.insert` | `entityUpsert` |
| 内容或 props | `block.update` | `entityUpsert` |
| 删除 | `block.delete` | `entityDelete` |
| 排序 | `block.move` | `listOrder` |

连续输入以 180 ms 窗口按顶层块合并。嵌套内容变化更新所属顶层块，不发送完整文档；snapshot 只用于首次连接和恢复。

## 运行与验收

```bash
pnpm dev:blocknote
pnpm exec playwright test e2e/blocknote.spec.ts
```

E2E 使用两个独立 Chromium BrowserContext，检查：

- 富文本更新与插入块在两端收敛；
- WebSocket submit 只含单块 payload，不含 `document` 或 `blocks`；
- 断网期间 operation 留在 pending queue，重连后从 snapshot 恢复并重放；
- canonical 块排序在两端一致。

## 当前限制

- 冲突粒度是顶层块；同一块的并发编辑按服务端顺序 LWW，不做字符级合并。
- BlockNote 本地 undo/redo 尚未映射为用户级 canonical undo。
- 协同光标/选区尚未接入 presence。
- BlockNote 默认 UI 的首屏 JS 约 1.13 MB（约 343 KB gzip），尚未做按需拆包。
