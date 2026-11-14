---
创建时间: 2026-10-31
更新时间: 2026-11-06
类型: 开发手册
所属项目: "26-04 AI4Science"
对应路线图: "S01最小产品路线图（OptionMemory 版）Phase 3 · Week 7–8"
状态: 实施中（Step 1 已完成，Step 2–7 待实施）
tags:
  - 开发手册
  - OptionMemory
  - 冲突消解
  - governance
  - DSH插件
---

# Week 7–8 开发手册：冲突消解与双 host 记忆模块首版（Phase 3）

> 本阶段完成两项独立但同期验收的交付：
>
> 1. S01 硬度 450 HV（文献）与 512 HV（实验）的多来源冲突检测、隔离和治理裁决；
> 2. 将 Phase 0–3 已验证能力封装为 **DSH + OpenCode v0.1.0 双 host 记忆模块**，由两种 host 的 LLM 分别实际调用。
>
> Phase 2 的 R3-RefRepair-01 只提供版本修订与 Agent 行为治理场景，不替代本阶段的多来源冲突验收。R4 暂缓不妨碍首版模块交付，但不得宣称完整 R1–R4 闭包已通过。
>
> **接入模式决策（2026-10-31）**：坚持原生双 host，不在本阶段建设 MCP server。两个适配层必须服从同一工具契约并通过交叉数据测试；未来 Codex/Pi 等框架优先评估新增原生适配层，MCP 仅按路线图 §9.7 的触发条件重新评审。
>
> **2026-11-06 增量修订**：在原冲突治理与双 host v0.1.0 基线之外，新增 Planner-ready 资产、事件 v0.2 和 continuous-host contract v0.1，分别验收。DSH/OpenCode 保持对话宿主，长任务后续接入同一个共享 planner-runtime；本阶段不分别建设持续服务平台，不实现 SuperAgent 或 dataStore，原 7 工具和治理验收不变。
>
> **Step 1 实施进展（2026-11-06）**：已实现 `src/runtime/conflict.ts` 与 `src/api/governance.ts` 的 M1 检测和隔离。450/512 HV 双方及受影响派生锥标 contested，关联 measure options 标 probation，历史原值可查询，冲突事件按 fact ID 对幂等；相同硬度值和多值 xrd_peak 不误报。同时修正 `memory_retract`/`restoreFact` 的级联范围，仅处理受影响依赖锥，并新增无关派生事实保持 in 的回归。独立 RocksDB 重启、部分写入对账与 Mem/RocksDB 对拍均已通过，当前 51 项全套测试通过，Step 2 待实施。

---

## 一、阶段目标与出口

### 治理目标

- 元规则 M1 检测同一试样同一性能的多值冲突；
- 冲突 facts 置 `contested`，关联 measure options 置 `probation`，派生锥暂停；
- settlement policy 按实验测定 > 仿真计算 > 文献摘录裁决；
- 512 HV 对应 option settle，450 HV 对应 option revoke 转休眠；
- 休眠记录可查询，≺ 保留谁提议、谁裁决、谁执行及时间戳。

### 双 host 模块目标

- 形成可安装的 DSH v0.1.0 与可发现的 OpenCode 项目级 v0.1.0；
- DSH v0.1.0-rc.8（pin）与 OpenCode 当前兼容版本分别加载无错；
- 两种 host 的 LLM 均可调用同一首版 7 工具完成 S01 写入、查询、推导、修订和冲突治理；
- 模块经 HTTP 使用独立 mnestic 服务，加载/卸载/重装不影响 RocksDB 数据；
- 核心 `src/memory`、`src/api`、`src/runtime` 不引入 Cordis/DSH/OpenCode 依赖。

## 二、统一能力版本路线

| 阶段 | 模块版本 | 工具变化 | 交付重点 |
|---|---|---|---|
| Phase 3 | **v0.1.0** | 首版 7 工具 | 冲突治理 + DSH/OpenCode 首次 LLM 联调 |
| Phase 4 | **v0.2.0** | 保持 7 工具契约 | parse option、结算账本与解析流水线 |
| Phase 5 | **v0.3.0** | 增加 memory_why，共 8 工具 | 血缘查询、六元组查询与事件导出 |
| Phase 6 | **v0.4.0** | 增加 query_achievable / certify，共 10 工具 | 生成增强、认证闭环与完整 MVP |

规则：

- 不提前注册未来工具，不在 manifest 或 OpenCode hooks 中放空实现/TODO 工具。
- 模块能力版本、DSH rc 与 OpenCode 版本是独立版本线；升级模块不等于升级 host。
- 每个 Phase 都必须从上一模块版本执行升级测试、全量回归和数据保留验证。
- `package.json`、`dsh.plugin.json`、OpenCode 模块文档与发布记录中的能力版本必须一致。

## 三、开工前置门槛

- Phase 0 正式关闭，Phase 1 R1–R3 部分验收完成，Phase 2 出口检查通过。
- `memory_retract` 的输入/输出、错误与审计契约已冻结。
- R3 v2 与质量记录保持原值不变、幂等和血缘完整；R4 仍明确阻塞。
- DSH v0.1.0-rc.8 与 vendored `@deepseek-ai/cordis` 可用，materials-agent 专用 profile 已准备。
- OpenCode 与 `@opencode-ai/plugin@1.19.5` 可用，当前 4 工具开发版通过测试，`.opencode/plugins/optionmemory.ts` 可被发现。
- RocksDB 实例可通过 HTTP 访问，默认仅绑定 `127.0.0.1`；token 配置路径已预留。
- 既有 `pnpm build` / `pnpm test` 全绿。

## 四、任务总览

| Step | 任务 | 交付物 | 验收 |
|---|---|---|---|
| 1 | M1 冲突检测与 ν-gate 隔离 | contested/probation 逻辑与日志 | 450/512 HV 双方被隔离 |
| 2 | settlement policy 与裁决链 | 策略配置、settle/revoke、≺ 记录 | 实验胜、文献休眠且可查询 |
| 3 | measure option/model 结算 | measure_hardness 与 model 记录 | 绑定与状态正确 |
| 4 | 单一 host-neutral 工具契约 | 7 工具名称、参数、返回、权限、开放阶段、只读规则的唯一来源 | 两个适配层不各自维护功能清单 |
| 5 | DSH + OpenCode 适配层与同一 7 工具 | apply/ctx.memory、Plugin hooks、tools、manifest/profile/项目配置 | 双 host 工具契约与核心服务层一致 |
| 6 | 双 host 集成测试与平台联调 | v0.1.0 模块包、共享契约/交叉读写测试、演示脚本、升级/重装记录 | 两种 LLM host 实际调用与数据保留通过 |
| 7 | Planner-ready 与持续宿主契约（增量） | planners/事件 v0.2、continuous-host contract、原生 Attention 适配与版本探针 | 增量契约与原生提问可映射，原 7 工具不回归 |

---

## 四A、分 Step 实施与 Vibe 指令

> Phase 2 出口签署是开工前提。每个 Step 先完成实现与隔离测试，再进入下一步。多元冲突治理与 host 封装分别验收，不能用插件加载成功替代治理正确性，也不能用治理测试替代双 host LLM 联调。

### Step 1：M1 冲突检测与 ν-gate 隔离（已完成）

**建议文件**：`src/runtime/conflict.ts`、`src/api/governance.ts`、`tests/governance.test.ts`。

**语义定稿**：

- M1 针对同一实体、同一性能谓词的多个 `status="in"` 取值。当前仅对 `hardness` 启用，不泛化为所有多值谓词。
- 检测到冲突后，两个 hardness facts 均标 `contested`，关联 measure options 标 `probation`，暂停其派生锥；历史原值仍保留，不删除。
- 隔离必须可查询、可追踪，不能仅返回文本警告。

**Vibe 指令 1-A**：

```text
任务：实现 S01 硬度 M1 冲突检测与隔离。
1. 在隔离 fixture 写入 hardness(S01,450 HV,source=literature) 和 hardness(S01,512 HV,source=experiment)，保留各自 measure option/model 绑定。
2. 实现同一实体+predicate+不同值的 M1 检测；不得误伤 xrd_peak 等多值谓词。
3. 将冲突 facts 标 contested、关联 measure options 标 probation，并暂停受影响派生锥。
4. 写 gate/conflict 事件，包含双方 fact id、option id、检测规则和时间。
5. 新增测试：冲突触发、无冲突不误报、重复检测幂等、历史值仍可查询。
交付：实现 + contested/probation 清单 + 测试 + 事件日志。
```

**验收**：

- [x] 450/512 HV 均为 contested，关联 options 为 probation。
- [x] 派生锥暂停有明确记录，原值未被覆盖或删除。
- [x] 重复检测不重复生成冲突事件。

### Step 2：settlement policy 与裁决链

**建议文件**：`src/runtime/settlement.ts`、`src/api/governance.ts`、`config/settlement-policy.json`、`tests/settlement.test.ts`。

**Vibe 指令 2-A**：

```text
任务：实现 S01 硬度 settlement policy 与完整裁决链。
1. 固定来源优先级：experiment > simulation > literature；未登记来源不得自动获胜，返回人工复核。
2. settle 512 HV 对应 experiment option，revoke 450 HV 对应 literature option 并转休眠。
3. 记录提议者、裁决者、执行者、时间、策略版本、双方事实和理由到 revision/governance 事件。
4. 休眠 option 和事实仍可查询，不物理删除；重复 settle/revoke 不重复记账。
5. 测试优先级、未知来源、重复裁决、历史可查询。
交付：策略配置 + settle/revoke API + 裁决事件 + 测试。
```

**验收**：

- [ ] 512 HV 对应 option settled，450 HV 对应 option revoked/dormant。
- [ ] 裁决链含完整 ≺，来源优先级未被误用。
- [ ] 未知来源不会自动 settle，重复裁决不重复写事件。

### Step 3：measure option/model 结算

**Vibe 指令 3-A**：

```text
任务：注册 measure_hardness 及对应 model，并完成本批次结算。
1. 使用 registerOption/registerSubtask/registerModel，保持 option_type=atomic、template_id=null。
2. 记录实验与文献两个 measure option 的 I/π/β、来源、成本和 prediction_error/calibration_history。
3. 按 Step 2 的结果更新 settled/revoked/probation 状态，不伪造成功率或外部验证。
4. 查询 option、model、subtask 绑定，确认状态与裁决事件一致。
交付：option/model/subtask 记录 + 结算记录 + 验收查询。
```

**验收**：

- [ ] measure_hardness 及 model 完整入库，绑定和状态正确。
- [ ] 结算含来源、成本、误差和裁决版本，无虚构校准指标。

### Step 4：统一 7 工具契约

**建议文件**：`src/api/tool-contracts.ts`、`tests/tool-contracts.test.ts`。

**Vibe 指令 4-A**：

```text
任务：将现有 4 工具契约扩展为 Phase 3 的 7 工具，保持单一来源。
1. 增加 memory_retract、settle、revoke 的名称、参数、返回、权限、开放阶段和错误语义；不得加入 memory_why/query_achievable/certify。
2. memory_retract 复用 Phase 2 的 actor/revision/audit 契约；settle/revoke 复用 Step 2 的治理契约。
3. 保持 memory_set/get/query/propose_option 参数兼容，JSON Schema 可供 DSH/OpenCode 同时使用。
4. 测试工具清单恰好 7 个、只读属性、必填字段和开放阶段。
交付：统一契约 + JSON Schema + 契约测试。
```

**验收**：

- [ ] 工具清单恰好为 memory_set/get/query/retract + propose_option/settle/revoke。
- [ ] 无未来工具占位，参数和错误语义与核心 API 一致。

### Step 5：DSH + OpenCode 双 host 适配

**Vibe 指令 5-A（共享适配）**：

```text
任务：实现 DSH/OpenCode 对同一 7 工具的适配，不复制业务逻辑。
1. DSH 在 src/plugins/dsh/ 实现 apply/inject/ctx.memory、manifest、profile patch 和工具错误映射。
2. OpenCode 在 src/plugins/opencode/ 保持 V1 server hooks 与 V2 id/setup，V2 用 ctx.tool.transform 注册 JSON Schema 工具。
3. 两者都复用 src/api/tool-contracts.ts、src/api/readOnlyQuery.ts 和核心服务；blocked 不得包装成成功。
4. memory_query 对 LLM 只允许只读查询，写操作必须在进入 mnestic 前拒绝。
5. 实现配置 endpoint/token/timeout，禁止加载失败时删表或重建 RocksDB。
交付：双 host 适配层 + 7 工具清单 + 配置示例 + 单元测试。
```

**Vibe 指令 5-B（交叉数据）**：

```text
任务：增加双 host 一致性与交叉数据测试。
1. 同一 fixture 分别经 DSH/OpenCode 调用 7 工具，比较 gate、reason、status 和返回数据。
2. 执行 DSH 写入 → OpenCode 读取，以及 OpenCode 写入 → DSH 读取。
3. 比较 fact id、J/≺、质量状态、R4 开放条件和 RocksDB 行数。
4. 测试 OpenCode V1/V2 加载；V2 以初始化 setup 日志为准，不依赖 plugin list 是否显示。
交付：共享契约测试 + 交叉数据报告 + 加载日志。
```

**验收**：

- [ ] 两种 host 对同一输入返回相同业务结果。
- [ ] 核心层无 Cordis/DSH/OpenCode 依赖，工具 schema 无重复维护。
- [ ] OpenCode V1/V2 均能加载，DSH profile 加载无错。

### Step 6：集成测试与 LLM 联调

**Vibe 指令 6-A**：

```text
任务：完成 Phase 3 双 host 平台验收。
1. 启动 RocksDB，执行 dsh plugin --profile materials-agent add . 安装 v0.1.0，启动 dsh web。
2. 在 OpenCode 中加载 .opencode/plugins/optionmemory.ts，核查 setup 日志。
3. 两种 host 的 LLM 分别完成：写入查询 S01、推导相结构、成分修订、450/512 HV 冲突、settle/revoke 和休眠回查。
4. 验证加载/卸载/重装后关键 fact id 与 RocksDB 行数不变，profile/项目配置隔离。
5. 归档工具调用日志、S01 结果、全量测试和未实现项。
交付：v0.1.0 模块包 + 双 host 演示脚本 + 联调记录 + 数据保留证据。
```

**验收**：

- [ ] 两种 LLM host 均实际调用 7 工具完成 S01 治理流程。
- [ ] memory_why/query_achievable/certify 未提前注册。
- [ ] 数据在加载/卸载/重装后保留，未实现项明确列出。

---

### Step 7：Planner-ready 与 continuous-host 契约（Planner 增量，独立验收）

**定位**：只建立后续 Planner 所需资产、事件与宿主映射，不在本阶段实现持续 Planner、inbox/outbox、SuperAgent 或 dataStore，也不改变首版 7 工具。

**建议文件**：`schema/09_planners.cozo`、`docs/planner-event-schema-v0.2.md`、`docs/continuous-host-contract.md`、`src/api/planner-registry.ts`、`src/api/planner-contracts.ts`、`src/api/continuous-host.ts`、`src/plugins/opencode/attention.ts`、`src/plugins/dsh/attention.ts`、`tests/continuous-host.test.ts`、`tests/attention-adapters.test.ts`。

**Vibe 指令 7-A（Planner-ready 资产与事件）**：

```text
任务：实现 planner-schema v0.1 与事件 v0.2，不回改 Phase 0–2 的完成记录。
1. 新增 planners 资产及注册接口；Option 增加 input_schema，Model 增加 reasoning/evidence/evaluation_spec。
2. 实现 subtask/planner/option/model 事件图，增加 plan_run/attempt 运行上下文标识；一个 plan_run 可含多个 planner_event 和 option_event，不新增 Executor 领域资产。
3. 事件包含 planner/instructions/inference/policy 版本、证据引用和 real/simulated/sidecar 来源，未知模型能力保持 null/uncalibrated。
4. 增量迁移先备份并核对行数、关键 id、J/≺ 与质量状态；禁止删表重建 RocksDB。
5. planner_decision 使用独立契约，不加入原 7 工具；Planner 文本不得替代 settle/revoke。
交付：资产、事件文档、注册与图查询测试、迁移及回滚记录。
```

**Vibe 指令 7-B（持续宿主与原生 Attention）**：

```text
任务：实现 continuous-host contract v0.1 和双 host 原生 Attention 映射。
1. 契约统一 start/deliver/stop/report、submit/status/stop/answer、人工输入、取消、恢复、确定性 ID、幂等和 mapping_version。
2. 核心只保存 ask/wait_condition、host_question_ref、answer_event_id 与恢复关联，不新建 Question Center、Attention UI 或权限审批。
3. OpenCode 将语义澄清映射到原生 question，操作审批复用 permission ask；DSH 映射到 ask_user_question/ctx.userQuestions/approval intent。
4. 对实际 DSH pin 探针 askTimed、continued、Remote answer；外部 runtime 只能经 root Session/Adapter 提问，不绕过 delegated caller 限制。
5. DSH/OpenCode 共用后续 planner-runtime，不分别建设调度器、长期 Source 或持续接单；SuperAgent 仅留 Phase 4 隔离探针，dataStore 保持独立后续模块。
6. 测试回答只唤醒一次 plan_run、跨 host 读取一致、原 7 工具与冲突治理不回归。
交付：宿主契约、原生 Attention 适配、版本探针和共享契约测试。
```

**增量验收**：

- [ ] Datalog 可遍历 subtask → plan_run → planner_event → option_event → option/model。
- [ ] continuous-host 契约可映射 start/deliver/stop/report，plan_run 不包含宿主专有任务状态机。
- [ ] OpenCode/DSH 使用各自原生提问与审批，回答只唤醒一次，未重复建设 Question Center。
- [ ] DSH 版本与 root Session 调用边界有实证，不把 master 新能力默认套用到旧 rc。
- [ ] 原七工具、冲突治理、R4 边界和既有测试不回归；SuperAgent/dataStore 未提前落地。

---

## 五、DSH / OpenCode v0.1.0 工具范围

| 工具 | 核心实现 | 首版要求 |
|---|---|---|
| `memory_set` | `src/api/memory.ts` | 完整六元组输入，经 ν 门，blocked 不落库 |
| `memory_get` | `src/api/memory.ts` | 按 id 返回完整 Fact 或 null |
| `memory_query` | 受控查询适配层 | 只读查询；不得让 LLM 直接执行任意写入 CozoScript |
| `memory_retract` | Phase 2 修订服务 | 经 ν 门，标 out 并记录 ≺，不是物理删除 |
| `propose_option` | Phase 1 注册服务 + 检验装置简化版 | MVP 仅 atomic option，记录 ⟨I,π,β⟩ 与绑定 |
| `settle` | Phase 3 治理服务 | 写入裁决、结算与 ≺，不得绕过 governance |
| `revoke` | Phase 3 治理服务 | 转休眠/撤销并保留可查询记录，不物理删除 |

`memory_set_batch` 继续作为服务层和导入脚本能力，不计入首版 DSH 工具数。`deriveClosure` 由 option 执行链或内部服务调用，不额外注册为第 8 个工具。

首版 manifest 不得出现 `memory_why`、`query_achievable`、`certify`。

## 六、双 host 封装要求

### 6.1 适配层

已建立 `src/api/tool-contracts.ts`，当前登记 4 个已实现工具，并可导出 JSON Schema；Phase 3 在同一模块补齐至 7 工具。`src/api/readOnlyQuery.ts` 提供共享只读防护。DSH/OpenCode 必须从同一契约生成各自 schema，不得手工维护两份功能清单。

框架交互只允许进入各自目录：

- DSH `src/plugins/dsh/`：apply/inject 生命周期、ctx.memory 与工具适配；
- OpenCode `src/plugins/opencode/`：Plugin hooks、zod schema 与工具适配；
- 两者均读取 endpoint/token/timeout 并注入同一 MnesticClient，只调用核心服务，不复制业务逻辑；
- 工具返回必须保留 `gate`、`reason`、fact/option id 及必要的质量/血缘字段，不把 blocked 包装成成功。

### 6.2 manifest、profile 与项目配置

- `dsh.plugin.json` 使用 v0.15 manifest，entry 指向构建后的 host 入口，contributes.tools 仅登记首版 7 工具；
- `cordis.patch.yml` 配置 mnestic endpoint、token 和 timeout，DSH rc pin 写入 profile/发布记录；
- `.opencode/plugins/optionmemory.ts` 转发至构建后的 OpenCode 入口，环境变量使用 OPTIONMEMORY_ENDPOINT/TOKEN/TIMEOUT_MS；
- manifest 与 package 版本均为 0.1.0，OpenCode 文档标记同一能力版本；
- 任一 host 加载失败不得触发对 RocksDB 的删表、清空或重建。

### 6.3 查询安全

原始 `memory_query` 是开发者接口，不能不加限制地变成 LLM 工具。首版至少采用一种只读防护：

- 固定实体/谓词/血缘查询模板；或
- 解析并拒绝含 `:put`、`:rm`、`:create`、`:replace`、`:delete` 等写操作的查询。

拒绝时返回明确错误，不将请求转发给 mnestic。OpenCode 当前开发版已实现以 `?` 开头校验和写操作拦截，Phase 3 保持同一防护。

### 6.4 OpenCode 模块

- `index.ts` 同时提供 V1 server hooks 与 V2 id/setup；`tools.ts` 用于 V1，`v2.ts` 通过 `ctx.tool.transform` 和共享 JSON Schema 注册工具；
- 当前 4 工具开发版只作提前验证，Phase 3 必须补齐 retract/settle/revoke 至 7 工具；
- V1 用 `opencode plugin list` 核查；V2 用 `opencode --standalone --print-logs --log-level debug debug agents` 核查 `[optionmemory] V2 setup completed`，不能仅凭 plugin list 为空判断失败；
- 配置、使用与版本边界统一维护在 `docs/opencode-plugin.md`。

## 七、集成与升级测试

### 7.1 服务层回归

- 既有记忆、闭包、注册与 Phase 2 修订测试全绿；
- 新增 M1、冲突隔离、settle/revoke 与裁决链测试；
- R3-RefRepair-01 继续通过，不与多元冲突场景合并计分。

### 7.2 双 host 工具契约测试

逐一验证 7 工具的成功、blocked、错误和审计返回；特别检查：

- 缺 linSource 的 memory_set 被拦截；
- memory_query 写语句被拒绝；
- memory_retract 不物理删除；
- 非 atomic option 被 propose_option 拒绝；
- settle/revoke 的休眠记录仍可查询；
- 未实现的未来工具未出现在工具清单。

同一 fixture 必须在两种 host 得到一致的 gate/reason/数据结果，并执行 DSH 写入 → OpenCode 读取及反向交叉验证；fact id、J/≺、质量状态、R4 开放条件和 RocksDB 行数不得因 host 不同而变化。

### 7.3 双 host 平台联调

```bash
dsh plugin --profile materials-agent add .
dsh web
opencode --standalone --print-logs --log-level debug debug agents
```

由 LLM 在 DSH 和 OpenCode 中分别实际完成：

1. 写入并查询 S01 基本事实；
2. 推导相结构及候选固溶体；
3. 执行成分修订并观察下游失效/恢复；
4. 写入 450/512 HV 冲突，观察 contested/probation；
5. settle 实验 option、revoke 文献 option并回查休眠记录。

验证加载、卸载、重装后 RocksDB 行数和关键 fact id 不变，materials-agent 与其他 profile 隔离，OpenCode 项目配置不影响其他项目。

## 八、后续版本迭代要求

### Phase 4 → v0.2.0

- 接入 parse_csv_materials 与 transient 结算账本；
- 保持首版 7 工具输入/输出兼容；
- 新增解析端到端测试，执行全量升级回归。

### Phase 5 → v0.3.0

- 新增 memory_why，工具总数 8；
- 事件流 GET /events 是可观测性接口，不计入 DSH / OpenCode 工具清单；
- 验证旧 profile 中既有调用无需改写。

### Phase 6 → v0.4.0

- 新增 query_achievable / certify，工具总数 10；
- 接入 generate option 与 ω_certify；
- R4 未恢复时，delta 相关生成约束仍单独标为未完成，不得借插件版本号宣称全部功能完成。

每次升级均归档：版本差异、工具差异、全量测试、数据保留、profile 隔离、pin rc 和回滚方式。

## 九、Phase 3 Repo 验收清单

### A. 交付物存在性

- [ ] M1 冲突检测、ν-gate 隔离、settlement policy 和 measure option/model 实现及测试。
- [ ] `src/api/tool-contracts.ts` 中恰好 7 个工具及对应 JSON Schema。
- [ ] `src/plugins/dsh/` 的 apply/ctx.memory/tools、manifest 和 materials-agent profile 配置。
- [ ] `src/plugins/opencode/` 的 V1/V2 入口、工具适配和 `.opencode/plugins/optionmemory.ts`。
- [ ] 双 host 契约测试、交叉数据测试、演示脚本、联调记录与 v0.1.0 模块包。
- [ ] `schema/09_planners.cozo`、事件 v0.2、continuous-host contract、双 host Attention 适配及对应测试（Planner 增量）。

### B. 治理功能验收

- [ ] 450/512 HV 双方 contested，关联 options probation，派生锥暂停。
- [ ] 实验 option settle、文献 option revoke 转休眠，来源优先级与裁决链完整。
- [ ] 休眠 option/fact 可查询，无物理删除，重复裁决不重复记账。
- [ ] 未知来源不自动获胜，measure_hardness 的 model 结算含成本与误差。
- [ ] R3-RefRepair-01 保持独立，不替代本多元冲突验收。

### C. 双 host 与数据验收

- [ ] DSH 安装加载成功，OpenCode V1/V2 加载成功；manifest/package/profile/文档版本一致。
- [ ] 两种 host 的 LLM 分别实际调用首版 7 工具完成 S01 治理流程。
- [ ] memory_why/query_achievable/certify 未提前注册。
- [ ] 同一 fixture 的 gate/reason/status 一致；DSH 与 OpenCode 交叉读取的 fact id、J/≺、质量状态一致。
- [ ] 全量测试通过，加载/卸载/重装后 RocksDB 行数与关键 fact id 不变。
- [ ] profile 与项目配置隔离，R4 开放条件未因 host 改变。
- [ ] Planner 增量：plan_run 事件图和 continuous-host 契约通过；OpenCode 使用原生 question/permission，DSH 使用 userQuestions/approval，回答只唤醒一次且版本调用边界有记录。

### D. 质量红线

- [ ] 核心层无 Cordis/DSH/OpenCode 依赖，CozoScript 仍集中于 MnesticClient。
- [ ] 工具契约只有一个来源，无重复 schema、无提前注册未来工具。
- [ ] memory_query 对 LLM 有只读防护，写语句在进入 mnestic 前被拒绝。
- [ ] 原始证据、休眠 option 和历史裁决均可回查，无物理删除或静默改写。
- [ ] 加载失败不删表/清空/重建，未实现项在发布记录中明确列出。
- [ ] Phase 4–6 的 v0.2.0/v0.3.0/v0.4.0 迭代要求已纳入发布计划。
- [ ] 未分别建设 DSH/OpenCode 调度器、长期 Source 或 Question Center；SuperAgent 与 dataStore 未提前纳入本阶段交付。

### E. 验收签署

| 角色 | 签署项 | 日期 | 签字 |
|---|---|---|---|
| 执行人 | A–D 全部核对通过 | | 待签 |
| 子课题2/3 负责人 | 治理红线复核 + Phase 3 关闭批准 | | 待签 |
| 子课题1 负责人 | 双 host 封装、联调与数据保留复核 | | 待签 |

> A–D 必须全部通过；插件安装或 LLM 演示不能替代治理与数据红线。签署后 Phase 3 关闭，后续 Phase 按 v0.2.0/v0.3.0/v0.4.0 迭代。
