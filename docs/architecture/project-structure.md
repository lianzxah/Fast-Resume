# 项目架构与目录规范

本文档定义 Fast Resume monorepo 的长期目录边界、包职责、依赖方向和测试组织方式。新增代码应遵循本文档；若现有设计无法满足需求，应先通过 ADR 记录边界调整，再修改代码。

## 1. Monorepo 顶层结构

```text
Fast-Resume/
├── packages/                  # 可独立构建、测试的业务与基础能力包
│   └── <package>/
│       ├── src/               # 生产代码
│       ├── __test__/          # 测试代码，目录结构镜像 src/
│       ├── package.json       # 包入口、依赖和脚本
│       └── tsconfig.json      # 包级 TypeScript 配置
├── docs/
│   ├── architecture/          # 当前有效的架构说明
│   ├── adr/                   # 已作出的关键架构决策
│   └── plans/                 # 有时效性的实施计划
├── scripts/                   # 仓库级检查和维护脚本
├── package.json               # 统一命令入口
├── turbo.json                 # 任务编排
└── vitest.workspace.ts        # Vitest workspace 清单
```

`dist/`、`.turbo/`、`node_modules/`、`*.tsbuildinfo` 和 `packages/server/data/` 属于生成物或本地运行状态，不作为源码架构的一部分，不得手工编辑或提交私有数据。

## 2. 包职责与依赖方向

依赖必须从产品层指向稳定的基础层，不允许反向依赖或跨包深层导入。

```text
editor ─────────► canvas-engine ──► shared
   ├────────────► templates ──────► shared
   └────────────► shared

server ─────────► ai-agent ───────► shared
   ├────────────► templates
   └────────────► shared
```

| 包              | 唯一职责                                     | 允许的内部 workspace 依赖              |
| --------------- | -------------------------------------------- | -------------------------------------- |
| `shared`        | 跨端类型、纯函数、序列化与稳定业务契约       | 无                                     |
| `canvas-engine` | 画布模型、布局、交互与导出能力               | `shared`                               |
| `templates`     | 简历模板定义与模板查询                       | `shared`                               |
| `ai-agent`      | AI 模型适配、编排与结构化编辑提案            | `shared`                               |
| `server`        | HTTP API、鉴权、持久化、导入导出与服务编排   | `shared`、`templates`、`ai-agent`      |
| `editor`        | React 页面、交互状态、浏览器端适配与 UI 编排 | `shared`、`templates`、`canvas-engine` |

跨包使用只允许通过包的公开入口，例如 `@resume-editor/shared`；禁止导入另一个包的 `src/**`。共享契约先进入 `shared`，但仅被单个包使用的实现应留在所属包内，避免把 `shared` 变成无边界的工具集合。

## 3. 包内生产代码结构

- `src/index.ts` 是库包公开 API 的唯一汇总入口；未从入口导出的模块视为包内实现。
- React 组件使用 `PascalCase.tsx`，Hooks 使用 `useXxx.ts`，普通模块与 store 使用 `kebab-case.ts`。
- 页面级编排放在 `editor/src/pages/`；可复用 UI 放在 `components/`；状态放在 `store/`；浏览器或 API 适配放在 `lib/`；副作用封装在 hooks 或明确的 service 中。
- 服务端 route 只处理 HTTP 边界和输入输出映射，业务与持久化逻辑放在 `services/`，数据库初始化放在 `db/`，横切请求逻辑放在 `middleware/`。
- 画布通用算法不得依赖 editor UI；可复用布局和元素逻辑归入 `canvas-engine`。

## 4. 测试目录规范

所有包都在包根目录使用且仅使用一个 `__test__/`。测试目录镜像 `src/` 的相对路径：

```text
packages/editor/
├── src/
│   ├── hooks/formal-resume-persistence.ts
│   └── store/editor-session.tsx
└── __test__/
    ├── hooks/formal-resume-persistence.test.ts
    └── store/editor-session.test.ts
```

- 测试文件统一命名为 `*.test.ts` 或 `*.test.tsx`；不使用 `tests/`、`__tests__/`、`*.spec.*`，也不把测试与生产代码共置在 `src/`。
- 快照放在对应测试旁的 `__snapshots__/`，fixture 放在相应模块下的 `fixtures/`。
- 测试通过公开包入口验证跨包行为；测试包内实现时，从 `__test__/` 显式导入对应的 `src/` 模块。
- 每个包的 `test` 命令只扫描 `__test__/`。根命令 `pnpm test` 和 `pnpm lint` 会先运行 `pnpm check:structure`，阻止目录规范回退。
- 新功能与缺陷修复应添加聚焦测试；涉及持久化、布局、共享转换器或 API 合约时必须覆盖错误路径或边界条件。

## 5. 文档与变更规则

- `docs/architecture/` 描述当前系统；不要在这里保留已经失效的计划。
- 跨包依赖、持久化模型或核心状态模型的长期决策写入 `docs/adr/`。
- 阶段性拆解写入 `docs/plans/`，完成后以架构文档和代码为准。
- 架构变更至少运行 `pnpm check:structure`、`pnpm lint` 和 `pnpm test`，并在 PR 中列出受影响的包。
