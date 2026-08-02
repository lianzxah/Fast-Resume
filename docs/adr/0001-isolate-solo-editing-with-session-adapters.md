---
status: accepted
---

# 使用隔离编辑会话承载 Solo 草稿

Solo 使用独立 EditorSession 和 Solo 草稿，不直接复用经典模式的全局 Store 或正式简历自动保存。经典和 Solo 通过不同 Adapter 实现同一个编辑会话 Interface，从而复用画布与编辑组件，同时隔离文档、选区、撤销栈、UI 状态和持久化。选择这一方案是因为直接复用全局 Store 会让 Solo 中间生成状态进入正式简历；创建完全独立的第二套编辑器又会复制画布行为并导致长期分叉。

## Consequences

- 现有 Store 必须工厂化，共享组件必须从当前 EditorSession 获取状态和命令。
- Solo 未发布前不能修改正式简历、缩略图或版本历史。
- 经典模式保持默认入口和现有行为，Solo 路由可以独立灰度和关闭。
