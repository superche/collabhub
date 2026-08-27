# React Flow 接入验证

## 结论

可以接入。React Flow 是受控视图；`GraphDocument`、Command 与权威规则仍属于宿主。

```text
React Flow callbacks
  -> GraphCommand adapter
  -> node.* | edge.* operation
  -> CollabHub Client Core
  -> GraphDocument Domain Pack
  -> canonical entity patches
  -> React Flow projection
```

本示例使用 React Flow 12 的 `@xyflow/react` 受控接口：`nodes`、`edges`、`onNodesChange`、`onEdgesChange` 与 `onConnect`。参考：[Quick Start](https://reactflow.dev/learn)、[Building a Flow](https://reactflow.dev/learn/concepts/building-a-flow)。

## 边界

| 层 | 依赖 |
|---|---|
| `src/components` | React、React Flow、应用 Runtime 接口 |
| `src/domain` | 通用 `GraphDocument`；不依赖 React Flow 或 CollabHub |
| `src/collab` | Command ↔ operation / canonical patch adapter |
| `server` | Graph Domain Pack；不依赖 React Flow |

Import boundary 测试会阻止 `components/application/domain` 引入 `@collabhub/*`，并阻止 canonical domain/server pack 引入 `@xyflow/react`。

## Operation 映射

| 画布行为 | operation | canonical patch |
|---|---|---|
| 新增/重命名/移动节点 | `node.add/rename/move` | `entityUpsert(nodes)` |
| 删除节点 | `node.delete` | 节点与关联边的多个 `entityDelete` |
| 连接/删除边 | `edge.add/delete` | `entityUpsert/Delete(edges)` |

拖拽帧只更新本地 React Flow state，`onNodeDragStop` 才提交一次 `node.move`。重命名在 blur/Enter 时提交；热路径不发送完整 graph。删除节点产生多个 patch，但只占一个 canonical version。

## 运行与验收

```bash
pnpm dev:react-flow
# 另开终端
pnpm record:react-flow
```

双客户端验收检查：节点新增与重命名同步、拖拽单次提交、离线 pending replay、canonical version 收敛，以及节点和关联边原子删除。

## 当前限制

- 同一节点的并发移动按服务端到达顺序 LWW，不做轨迹合并。
- viewport、选择态与临时连线属于本地 UI state，未进入 presence。
- 尚未实现分组节点、子流与用户级 canonical undo。
