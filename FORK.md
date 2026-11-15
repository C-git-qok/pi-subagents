# FORK.md — 本 fork 的维护手册

> `C-git-qok/pi-subagents` 是 [`tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的个人维护 fork。
> 本文件写给**维护者与 agent**：哪里改过、怎么同步上游、怎么验收、哪些不能动。

## 1. 当前状态

| 项 | 值 |
|---|---|
| 上游仓库 | `tintinweb/pi-subagents`，默认分支 **master** |
| 上游基点 | `e22c178`（含 v0.25.0 `b8efc06` + #451 + #453），2026-11-15 同步 |
| 版本号 | `0.25.0-fork.1` —— 规则：上游版本 + `-fork.N` |
| pi 要求 | `>= 1.1.0`（已实测 1.4.0 / 1.5.2） |
| 运行时 | pi 直接加载 `src/index.ts`（TypeScript 源码，**不需要构建**） |
| 依赖 | 仅 `croner`、`nanoid`；devDeps 用于 tsc/biome/vitest |

## 2. 与上游的唯一功能差异：子会话 session-dir 隔离

**要解决的问题**：subagent 的会话文件默认写在会话目录顶层，导致 `/resume` 列表被大量子会话污染。

**做法**：子会话落到 `<父会话目录>/<父会话文件名去 .jsonl>/tasks/`；多级嵌套按 `<…>/tasks/<子会话名>/tasks/` 递归。

改上游代码时必须保住的三处：

| 位置 | 要求 |
|---|---|
| `src/session-dir.ts` | 新增文件，纯函数 `deriveSubagentSessionDir()`，无外部依赖 |
| `src/agent-runner.ts` → `runAgent()` / `reopenSession()` | `SessionManager.create` **和**跨父 `SessionManager.forkFrom`（它新建文件）都用 `effectiveSessionDir`；只有 `SessionManager.open`（就地打开原文件）用 `baseSessionDir` |
| `test/agent-runner.test.ts` | 隔离断言（含跨父续跑的落点），是这条补丁**唯一的自动化护栏** |

**前提假设**：Pi 的会话发现是**浅层扫描**（只扫顶层 `*.jsonl`）。若 Pi 改为递归扫描，该策略失效，必须重新设计。

`reopen` 的对象分两种，落点不同，改上游时**不要合并成一件事**：

- `SessionManager.open`（同一父会话就地续跑）：仍用 `baseSessionDir`。它只打开已存在的文件，目录参数只影响之后的 `/new`、`/branch`；搬进 `tasks/` 会把续跑后派生的新会话一起带进子目录。
- `SessionManager.forkFrom`（另一个父会话续跑，**0.23.0 起才有**）：它**新建**一个 `.jsonl`，本质是 spawn，必须用 `effectiveSessionDir`。用 `baseSessionDir` 会让子会话重新出现在 `/resume`，正好打穿本 fork 的唯一目标。

**已知上游坑**：`SessionManager.forkFrom` 的 `options.parentSession` 在 pi 1.1.0–1.5.x 里**没有实现**（实现只读 `options.id`），副本 header 的 `parentSession` 永远指向被 fork 的旧子会话文件。所以：**不要用 header 的父子关系判断副本归属**；测试里 `{ parentSession: … }` 那条断言只固定调用意图，不代表 pi 会照做。

## 3. 同步上游流程

```bash
# 在临时区做，不要直接动 pi 正在加载的目录
rm -rf /tmp/opencode/pi-up
git clone https://github.com/C-git-qok/pi-subagents /tmp/opencode/pi-up
cd /tmp/opencode/pi-up
git remote add upstream https://github.com/tintinweb/pi-subagents
git fetch upstream master --tags
git rebase upstream/master
```

### 冲突预期

正常情况**只有 3 个文件冲突**：

- `src/agent-runner.ts` —— 会话创建块（上游重构过这里的 `parentSessionFile` / `reopenSession`）
- `test/agent-runner.test.ts` —— 会话隔离断言（跨父续跑的落点 + 就地续跑仍用基础目录）。上游在这一版改了近 500 行，冲突概率高；解冲突时两边**都要留**，不能只取上游。
- `README.md` —— 取上游版本，再在顶部加回 fork banner

`src/agent-runner.ts` 的会话创建块应解成：

```ts
const persistSession = agentConfig?.persistSession ?? (options.nested ? false : rememberAgents);
// fork: 子会话隔离目录
const parentSessionFile = ctx.sessionManager?.getSessionFile?.();
const baseSessionDir = configuredSessionDir ?? defaultSessionDir;
const effectiveSessionDir = parentSessionFile
  ? deriveSubagentSessionDir(parentSessionFile, baseSessionDir)
  : baseSessionDir;
const sessionManager = options.resumeSessionFile
  ? reopenSession(options.resumeSessionFile, parentSessionFile, baseSessionDir, effectiveSessionDir)
  : persistSession
    ? SessionManager.create(effectiveCwd, effectiveSessionDir, { parentSession: parentSessionFile })
    : SessionManager.inMemory(effectiveCwd);
```

import 行记得保留：`import { deriveSubagentSessionDir } from "./session-dir.js";`

版本号同步为 `<上游版本>-fork.N`。

## 4. 验收清单（缺一不可）

```bash
npm ci
npx tsc --noEmit                                   # 必须 0
npx biome check src test                           # 必须 0
npx vitest run test/workflow-runtime.test.ts test/workflow-task.test.ts \
  test/workflow-tool.test.ts test/workflow-progress.test.ts \
  test/agent-runner.test.ts test/agent-manager.test.ts \
  test/agent-types.test.ts test/nested-tools.test.ts
npx vitest run                                     # 全量；2026-11-15 基线：129 文件 / 2670 通过 / 7 跳过
```

铺到在用目录后的补充验证：

```bash
diff -r -q --exclude=.git --exclude=node_modules --exclude=dist <快照目录> <在用目录>   # 必须一致
bun -e 'const m = await import("./src/index.ts"); console.log(typeof m.default)'        # 应为 function
```

## 5. 不要做的事

- **不要在 pi 正在使用的目录里跑 `pi update`**：它对 git 克隆执行 `reset --hard origin/HEAD`，会抹掉未提交的本地改动（reflog 有先例）。
- **不要删除上游跟踪的文件**（`AGENTS.md`、`docs/`、`.github/`、`CHANGELOG.md`、`media/` 等）。上游还在改（2026 年内 `AGENTS.md` 13 次、`docs/` 18 次），删了会让每次同步都产生 `modify/delete` 冲突，收益远小于成本。唯一例外是 `.pi/agents/auditor.md`（上游 demo，运行时不加载）。
- **不要为了「清理」重写 README 全文**：保留上游 README 原文 + 顶部 banner，冲突才可控。
- `reopen` 分支**分两种，规则相反**：`SessionManager.open`（同一父会话就地续跑，只打开已存在的文件）**不要**套用 `effectiveSessionDir`；`SessionManager.forkFrom`（另一个父会话续跑，**会新建** `.jsonl`）**必须**用 `effectiveSessionDir`，否则子会话重新出现在 `/resume`。
- 不要提交 `.env` / `.npmrc`（已在 `.gitignore` 中）。

## 6. 已接受的上游行为变更（同步到 0.25.0 时引入）

| 变更 | 影响 |
|---|---|
| #451 删除「按 agent 数量自动起 workflow」的 guideline | 说「用 10 个 agent」会走并行 `Agent`，要 workflow 必须显式说或指名已保存的 workflow |
| #453 运行中实时显示 tool/token 计数 | 运行中即可判断是「在干活」还是「卡住」；`budget.spent()` 计入被重试停掉的尝试 |
| 进度日志原地更新（`agentSlots`） | 长 run 不再膨胀 session 条目 |
| `maxConcurrentNested` 默认 10 | 仅约束 workflow **之外**的嵌套 spawn；超限直接拒绝（不排队，避免与父死锁）；`0` = 无限 |
| FleetView 行显示 agent 自身 token | 父行数字变小是口径变化，不代表省了；合计仍在其他界面 |
| 内置 `general-purpose` 可再派子 agent（depth 2） | 若不需要：`maxSubagentDepth: 1` |
| `/agents` Settings 默认写 `~/.pi/agent/subagents.json` | 不再往每个仓库扔 `.pi/subagents.json`；Tab 可切项目文件 |
| `Explore` 不再 pin `anthropic/claude-haiku-4-5`，改为继承会话模型 | 子代理的成本/延迟随主模型走；本机主模型是 `opencode-go/deepseek-v4.1-flash`，实际影响很小 |

## 7. 文件策略速查

| 类别 | 处理 |
|---|---|
| `src/` `package.json` `package-lock.json` `tsconfig.json` `LICENSE` | 运行时/构建必需，绝不能删 |
| `test/`（120 个测试文件） | 保留 —— 是 fork 补丁的唯一回归保障 |
| `CHANGELOG.md` | 保留 —— 判断「上游改了什么、值不值得升级」的主要依据 |
| `docs/` `examples/` `media/` `README.ja.md` `README.ko.md` `CONTRIBUTING.md` `SECURITY.md` `.github/` | 保留（冲突成本 > 体积收益）；只想减小本地噪音就用 `git sparse-checkout`，它不改 git 树、不与上游冲突 |
| `.pi/agents/auditor.md` | 已删除（上游 demo，`package.json` 未声明 `pi.agents`，`.npmignore` 也排除） |
| `node_modules/` `dist/` `coverage/` `*.log` `.env*` `*.tgz` | 忽略（见 `.gitignore`） |
