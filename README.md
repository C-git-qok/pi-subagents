# @tintinweb/pi-subagents（Fork）

> 基于 [@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) 的个人维护 fork。
>
> 本 fork 保留上游的子代理、Workflow、FleetView、Agent Mention、steering、会话恢复和跨扩展 RPC 等能力，仅针对 **persisted subagent session 的存储位置**做最小修改：
>
> **子代理 session 从父 session 所在目录的扁平 `.jsonl` 文件，隔离到 `<parent-session-basename>/tasks/` 子目录，从而避免普通 `/resume` 列表被内部子代理 session 淹没。**

本项目用于 [Pi](https://pi.dev) coding agent，提供类似 Claude Code 的自主子代理和工作流编排能力。

每个子代理运行在独立会话中，可以拥有自己的工具、系统提示、模型、思考级别和生命周期。

---

# 与上游的主要区别

本 fork 的核心目标不是重新设计 `pi-subagents`，而是：

> **保持上游 Agent orchestration / RPC / UI / lifecycle 行为不变，只改变持久化 child session 的物理目录边界。**

## 1. 子代理 Session 隔离

### 原始问题

上游版本会将持久化的子代理 session 与普通顶层 session 放在同一个扁平目录。

例如：

```text
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
├── another-session.jsonl
├── explore.jsonl
├── review.jsonl
└── audit.jsonl
```

这样当子代理数量较多时，`/resume` 会出现大量内部 Agent session，主 session 很难查找。

### 本 fork 的处理方式

子代理 session 改为：

```text
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
├── another-session.jsonl
└── main/
    └── tasks/
        ├── explore.jsonl
        ├── review.jsonl
        └── audit.jsonl
```

其中：

```text
main.jsonl
```

是顶层父 session，而：

```text
main/
└── tasks/
```

是由父 session 文件名派生出的子代理 session 目录。

父 session：

```text
~/.pi/agent/sessions/<cwd>/main.jsonl
```

对应：

```text
~/.pi/agent/sessions/<cwd>/main/tasks/
```

## 2. `/resume` 保持干净

本 fork 依赖 Pi 当前的 session discovery 行为：

* 普通 `/resume` 只扫描顶层 session 目录中的 session 文件；
* 不递归遍历 `tasks/` 子目录；
* 因此子代理 session 不会出现在普通 `/resume` 列表中。

效果：

```text
/resume

✅ main
✅ another-session

❌ explore
❌ review
❌ audit
```

> 注意：这是对 Pi 当前非递归 session discovery 行为的依赖。如果未来 Pi Core 改为递归扫描 session 目录，则该隔离策略需要重新评估。

---

# Session 恢复行为

子代理 session 仍然保持持久化。

本 fork **不会关闭或修改 `rememberAgents` 的持久化机制**。

推荐：

```text
rememberAgents = true
```

这样可以保留：

* 子代理完整会话上下文；
* Agent handle 恢复；
* 中断后继续；
* 长生命周期子代理的 session persistence。

变化仅在：

```text
session persistence location
```

而不是：

```text
session persistence policy
```

---

# `@handle` 恢复

子代理仍然可以通过 Agent handle 恢复。

例如：

```text
@explore continue the investigation
```

恢复路径逻辑保持：

```text
Agent Handle
    ↓
Subagent Record
    ↓
Persisted Session Path
    ↓
SessionManager.open(...)
```

由于完整 session path 仍被保留，子代理即使不出现在普通 `/resume` 列表中，也可以通过 `@handle` 恢复。

---

# 多级子代理

子代理可以继续创建子代理。

本 fork 使用 parent lineage 派生目录，因此多级 Agent 会自然形成树形 session 结构。

例如：

```text
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
└── main/
    └── tasks/
        ├── explore.jsonl
        └── explore/
            └── tasks/
                └── child.jsonl
```

对应关系：

```text
main.jsonl
    └── explore.jsonl
        └── child.jsonl
```

目录层级反映 Agent 的 parent/child lineage。

这种多级嵌套是有意设计的，不会破坏顶层 `/resume` 列表。

---

# 实现方式

本 fork 只对两个源码文件进行 session isolation 相关修改。

## `src/session-dir.ts`

新增：

```text
src/session-dir.ts
```

提供：

```ts
deriveSubagentSessionDir(
  parentSessionFile,
  fallbackDir
)
```

逻辑：

```text
有父 session：

<parent-directory>/
    <parent-session-basename>/
        tasks/

无父 session：

临时目录 fallback
```

示例：

```text
parent:
~/.pi/agent/sessions/main.jsonl

result:
~/.pi/agent/sessions/main/tasks/
```

该实现参考了 [gotgenes/pi-subagents](https://github.com/gotgenes/pi-subagents) 中的 session directory isolation 思路。

## `src/agent-runner.ts`

在 `runAgent()` 中：

1. 获取当前父 session 文件；
2. 计算基础 session directory；
3. 根据 parent session 派生 `tasks/` 子目录；
4. 创建新的 persisted subagent session 时使用该目录；
5. Resume 已存在的子代理 session 时继续使用原有基础目录解析逻辑。

核心原则：

```text
Create child session
    → derived tasks/ directory

Resume existing session
    → existing session path / base directory

parentSession metadata
    → unchanged
```

因此：

> **本 fork 不修改 parentSession lineage，只改变 session 文件存储位置。**

---

# 与上游功能的兼容性

| 功能                    | 状态 | 说明                                |
| --------------------- | -- | --------------------------------- |
| Agent Tool            | ✅  | 保持上游行为                            |
| Parallel Agents       | ✅  | 保持上游行为                            |
| FleetView             | ✅  | 未修改                               |
| Agent Mentions        | ✅  | 未修改                               |
| `steer_subagent`      | ✅  | 未修改                               |
| `get_subagent_result` | ✅  | 未修改                               |
| Workflow              | ✅  | 未修改                               |
| Nested Subagents      | ✅  | 保持 parent lineage，session 按树形目录隔离 |
| Session Resume        | ✅  | 持久化 session 仍然保留                  |
| `@handle` Resume | ⚠️ 待验证 | session 持久化逻辑未改，但新存储位置需要恢复链实测 |
| `rememberAgents`      | ✅  | 持久化逻辑不变，建议保持开启                    |
| `/resume`             | ✅  | 顶层列表不再显示 child session            |
| `pi-tasks`            | ✅  | 不修改 Task lifecycle / RPC contract |
| Cross-extension RPC   | ✅  | 本 fork 不改变 RPC 接口                 |

---

# 与 `pi-tasks` 的关系

本 fork 可以继续与：

```text
@tintinweb/pi-tasks
```

组合使用。

职责保持分离：

```text
pi-tasks
    ↓
Task / TODO / 状态跟踪

pi-subagents
    ↓
Subagent execution / lifecycle / session

Pi Session
    ↓
实际 transcript persistence

OAK Project Rules
    ↓
Evidence / verification / acceptance
```

本 fork **不修改**：

* TaskExecute
* TaskOutput
* Task lifecycle
* Task dependency
* pi-tasks RPC contract

因此 session isolation patch 不应该影响 `pi-tasks` 的任务跟踪逻辑。

---

# 为什么不直接关闭 `rememberAgents`

本 fork 不建议通过：

```text
rememberAgents = false
```

来解决 `/resume` 污染。

因为：

```text
rememberAgents = false
```

会改变 session persistence 本身。

这可能影响：

* 子代理恢复；
* 长生命周期 Agent；
* `@handle` continuation；
* 跨回合上下文保留；
* 子代理完成后的生命周期处理。

本 fork 的解决方式是：

```text
rememberAgents = true
        +
child session isolated storage
```

而不是：

```text
rememberAgents = false
```

即：

> **保留 persistence，隔离 presentation。**

---

# 安装

## GitHub 安装（推荐用于长期使用）

假设 fork 仓库：

```text
https://github.com/C-git-qok/pi-subagents
```

安装：

```bash
pi install git:github.com/C-git-qok/pi-subagents
```

如需固定版本，建议使用 tag：

```bash
pi install git:github.com/C-git-qok/pi-subagents@v0.19.0-oak.1
```

这样可以避免主分支后续变化影响当前环境。

---

# 本地安装

开发阶段可以直接使用本地目录：

```bash
pi install file:~/dev/pi-subagents
```

例如：

```bash
cd ~/dev/pi-subagents
bun install
pi install file:.
```

之后修改源码即可继续测试。

---

# 开发

克隆 fork：

```bash
git clone https://github.com/C-git-qok/pi-subagents.git
cd pi-subagents
```

安装依赖：

```bash
bun install
```

构建：

```bash
bun run build
```

运行开发版本：

```bash
pi -e ./src/index.ts
```

运行测试：

```bash
bun test
```

---

# Session Isolation 验证

安装后建议至少验证以下行为。

## 1. 创建子代理

运行：

```text
Agent(...)
```

预期：

```text
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
└── main/
    └── tasks/
        └── <child>.jsonl
```

而不是：

```text
~/.pi/agent/sessions/<cwd>/
├── main.jsonl
└── <child>.jsonl
```

## 2. 检查 `/resume`

```text
/resume
```

预期：

```text
main
```

不会出现：

```text
child
review
explore
```

## 3. 检查 `@handle`

重新启动 Pi 后：

```text
@explore continue
```

预期：

```text
恢复原有 child session
```

而不是新建一个空白 Agent session。

## 4. 检查多级 Agent

验证：

```text
main
└── child
    └── grandchild
```

最终目录应类似：

```text
main/
└── tasks/
    └── child.jsonl
        └── child/
            └── tasks/
                └── grandchild.jsonl
```

---

# 设计边界

本 fork 有意不修改以下内容：

* Pi Core session manager；
* `/resume` 的核心实现；
* Agent orchestration API；
* Workflow API；
* FleetView；
* RPC 协议；
* `parentSession` lineage；
* `rememberAgents` persistence policy；
* 上游 Agent 工具语义。

唯一目标：

```text
Top-level session
    ↓
Top-level /resume

Subagent session
    ↓
Parent/<parent-basename>/tasks/
    ↓
Persistent but hidden from normal /resume
```

---

# 维护说明

## 与上游同步

该 fork 尽量保持与：

```text
@tintinweb/pi-subagents
```

接近。

同步上游时重点检查：

```text
src/agent-runner.ts
src/session-dir.ts
```

尤其关注：

* `SessionManager.create()`
* `SessionManager.open()`
* `rememberAgents`
* `persistSession`
* `parentSession`
* `resumeSessionFile`
* Pi session discovery 规则

如果上游改变这些 API，需要重新验证本 fork 的 session isolation。

---

## Pi Core 兼容性

当前方案依赖：

> Pi session discovery 对顶层 session directory 的非递归扫描行为。

如果未来 Pi 改为递归搜索：

```text
sessions/**/*.jsonl
```

则：

```text
tasks/*.jsonl
```

可能重新进入 `/resume`。

届时应重新评估：

* Pi Core 原生 child-session metadata；
* hidden session capability；
* dedicated session namespace；
* 或新的官方 session hierarchy API。

---

# 上游与来源

## 上游项目

[@tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)

这是本 fork 的主体代码和功能来源。

## Session Isolation 参考

[gotgenes/pi-subagents](https://github.com/gotgenes/pi-subagents)

本 fork 的：

```text
deriveSubagentSessionDir()
```

参考并适配了其 child-session directory isolation 设计。

本 fork 没有改变上游项目原有的主要 Agent orchestration 架构。

---

# 许可证

本项目遵循上游项目的 MIT License。

原项目版权与许可证信息保持不变。

本 fork 的新增修改同样以兼容 MIT License 的方式发布。
