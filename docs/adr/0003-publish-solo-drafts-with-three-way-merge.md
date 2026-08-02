---
status: accepted
---

# 使用三方合并发布 Solo 草稿

派生 Solo 草稿发布时，以创建草稿时的正式简历为 Base、发布时最新正式简历为 Current、Solo 草稿为 Draft，分别合并语义内容、布局约束和自由画布元素。经典模式可以在 Solo 运行期间继续编辑同一份正式简历；双方修改同一字段或约束时必须人工审阅，禁止最后写入者静默覆盖。

## Consequences

- 派生草稿必须保存完整 Base 文档、revision 和 hash。
- 经典保存与 Solo 操作都需要产生可比较的 DocumentChangeSet。
- 发布是正式历史中的单个原子版本，Solo 内部细粒度历史留在草稿中。
- SQLite 元数据和本地文档产物必须由 SoloDraftPublisher 协调为可回滚的原子发布流程。
