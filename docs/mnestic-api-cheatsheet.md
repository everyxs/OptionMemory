# mnestic API 速查

> **版本基准**：mnestic **0.17.0**（crates.io 发布包，CozoDB 维护 fork；发布名 `mnestic`，Rust lib 名 `cozo`）。
> **取证范围**：本文每条结论均来自本地源码 `mnestic-0.17.0/`（crate 根，下同）或本工作区适配层源码，逐条附「来源：文件:行号」；涉及 0.18.0 的升级警告单独标注，来源为 GitHub main 分支 README。
> **部署形态**：本工作区以 Mem（内存、非持久化）模式运行，HTTP 端点 `http://127.0.0.1:9070`（见 §1.2）；2026-09-24 起亦支持 `--rocks`（RocksDB 持久化，数据目录 `.data/mnestic`）。

---

## 1. CozoScript 执行入口

### 1.1 Rust 库 API

```rust
use cozo::{DataValue, DbInstance, NamedRows, ScriptMutability};
use std::collections::BTreeMap;

// 打开实例：engine ∈ "mem" | "sqlite" | "rocksdb"（| "sled" | "tikv"，实验性）
let db = DbInstance::new("mem", "", "")?;

// 快捷入口：可变脚本、无参数
let res: NamedRows = db.run_default("?[x] <- [[1]]")?;

// 完整入口：脚本 + 参数 + 可变性
let res2: NamedRows = db.run_script(
    "?[x] := x = $x",
    BTreeMap::from([("x".to_string(), DataValue::from(1))]),
    ScriptMutability::Mutable,
)?;
```

签名与类型（均已核实）：

- `pub fn new(engine: &str, path: impl AsRef<Path>, options: &str) -> Result<Self>`；engine 分派：`"mem"` / `"sqlite"` / `"rocksdb"`。
  来源：`src/lib.rs:211`（分派 `:214/:216/:218`）
- `pub fn run_script(&self, payload: &str, params: BTreeMap<String, DataValue>, mutability: ScriptMutability) -> Result<NamedRows>`。
  来源：`src/lib.rs:353-358`；底层 `Db::run_script` 同签名：`src/runtime/db.rs:605-612`
- `pub fn run_default(&self, payload: &str) -> Result<NamedRows>`（= `run_script(payload, 空参数, Mutable)`）。
  来源：`src/lib.rs:376-378`
- `pub enum ScriptMutability`。来源：`src/runtime/db.rs:94`
- `pub struct NamedRows { pub headers: Vec<String>, pub rows: Vec<Vec<DataValue>>, ... }`，derive `Serialize, Deserialize`。
  来源：`src/runtime/db.rs:263-265`
- crate 根再导出：`DataValue`（`src/lib.rs:70`）、`NamedRows`（`src/lib.rs:90`）、`ScriptMutability`（`src/lib.rs:127`）。
- **自然 JSON ⇄ DataValue 转换**（HTTP/绑定层用）：`impl From<JsonValue> for DataValue`（`src/data/json.rs:17`）、`impl From<&JsonValue> for DataValue`（`src/data/json.rs:36`）、`impl From<DataValue> for JsonValue`（`src/data/json.rs:55`）。注意：`DataValue` 的 serde `Deserialize` 是**标签式枚举**（如 `{"Str":"Bob"}`），直接 `serde_json::from_value`  plain JSON 会报 `unknown variant`——plain JSON 请走 `From<JsonValue>`。

### 1.2 HTTP 端点（本工作区适配层，端口 9070）

适配层源码：`server/src/main.rs`（std-only 实现，无 WebSocket）。

| 端点 | 请求 | 响应 | 来源 |
|---|---|---|---|
| `POST /text-query` | JSON `{"script": "<CozoScript>", "params": {"k": v}?}` | 200：`{"headers":[...],"rows":[[...]],"next":null}`；错误：`{"ok":false,"message":"..."}` | `main.rs:152`（分派）、`main.rs:78-104`（执行+自然 JSON 输出） |
| `GET /` 或 `HEAD /` | — | `{"name":"mnestic","version":"0.17.0","engine":"mem","persistent":false,"endpoints":{...}}` | `main.rs:141-151` |

- params 为**自然 JSON**（`"Bob"`、`1`、`[1,2]`），由 `DataValue::from(JsonValue)` 转换。来源：`main.rs:160-165`、`src/data/json.rs:17`
- 交互式 REPL 入口同进程提供（stdin，空行执行，`:quit` 退出）。来源：`main.rs:202`

**实测示例**（对运行中的 9070 实例逐条验证过）：

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"script":":create friend {name: String}"}' http://127.0.0.1:9070/text-query
# {"headers":["status"],"next":null,"rows":[["OK"]]}

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"script":"?[name] <- [['"'"'Alice'"'"'],['"'"'Bob'"'"']] :put friend {name}"}' \
  http://127.0.0.1:9070/text-query
# {"headers":["status"],"next":null,"rows":[["OK"]]}

curl -s -X POST -H "Content-Type: application/json" \
  -d '{"script":"?[name] := *friend{name}, name == $who","params":{"who":"Bob"}}' \
  http://127.0.0.1:9070/text-query
# {"headers":["name"],"next":null,"rows":[["Bob"]]}
```

---

## 2. 建表语法 `:create`

### 2.1 语法形态

`:create` 是查询脚本的 **relation 输出选项**（不是 `::` 系统操作），形态为 `查询体 :create 关系名 {key列 => value列}`。

- 语法：`relation_option = {relation_op ~ (compound_ident | underscore_ident) ~ table_schema?}`，`relation_create = {":create"}`。
  来源：`src/cozoscript.pest:167-169`
- 表结构：`table_schema = {"{" ~ table_cols ~ ("=>" ~ table_cols)? ~ "}"}`——`=>` 前为 key 列、后为 value 列；**省略 `=>` 则全部列都是 key 列**。
  来源：`src/cozoscript.pest:247-248`
- 单列定义：`table_col = {ident ~ (":" ~ col_type)? ~ (("default" ~ expr) | ("=" ~ out_arg))?}`——可省略类型、可带 `default <表达式>` 默认值。
  来源：`src/cozoscript.pest:249`

### 2.2 列类型全集（12 种 + 可空后缀 `?`）

`Any, Bool, Int, Float, String, Bytes, Uuid, List{元素类型,长度?}, Vec{F32|F64,长度}, Tuple(...), Validity, TxTime, Json`。

- 枚举定义。来源：`src/data/relation.rs:86-112`（`TxTime` 为 fork 新增，见 `:104-110` 注释）；向量元素类型仅 `F32/F64`：`src/data/relation.rs:114-120`
- 语法记号：`Any | Bool | Int | Float | String | Bytes | Uuid | Json | Validity | TxTime | [T; n]（定长 List）| (T1, T2, ...)（Tuple）| <F32; dim>（Vec）`；任意类型可加 `?` 表 nullable（`src/cozoscript.pest:253`）。
  来源：`src/cozoscript.pest:250-268`（`txtime_type` `:264`，向量 `vec_type` `:267-268`）

### 2.3 索引是独立的 `::` 系统操作（不属于 `:create`）

| 操作 | 语法 | 来源 |
|---|---|---|
| 普通索引 | `::index create rel:idx {col, ...}` / `::index drop rel:idx` | `src/cozoscript.pest:20,36,38`；解析为 `SysOp::CreateIndex`：`src/parse/sys.rs:866-889` |
| 向量索引 | `::hnsw create rel:idx {...}`（详见 §5） | `src/cozoscript.pest:21,37`；`src/parse/sys.rs:744-852` |
| 全文索引 | `::fts create rel:idx {...}` | `src/cozoscript.pest:22`；`SysOp::CreateFtsIndex`：`src/parse/sys.rs:730` |
| LSH 索引 | `::lsh create rel:idx {...}` | `src/cozoscript.pest:23`；`SysOp::CreateMinHashLshIndex`：`src/parse/sys.rs:503` |

### 2.4 同名冲突行为

- `:create` 遇到已存在关系**报错不覆盖**（`StoreRelationConflict`）。来源：`src/runtime/db.rs:3392-3401`；测试：`src/runtime/tests.rs:735-738`
- 需要覆盖用 `:replace`（跳过存在性检查、重建关系）。来源：`src/runtime/db.rs:3402`、`src/query/stored.rs:133-134`

### 2.5 真实示例（引自源码测试）

```cozoscript
:create friends {fr: Int, to: Int => data: Any}
```
来源：`src/runtime/tests.rs:459`

```cozoscript
:create status {uid: String, ts default now() => quitted: Bool, mood: String}
```
（`default now()` 默认值列；写入时可省略该列。）来源：`src/runtime/tests.rs:204-208`

---

## 3. 写入语法 `:put` / `:insert` / `:rm` 与事务

### 3.1 写操作语义差异

写入操作与 `:create` 共用 `relation_option` 语法（花括号，非方括号；schema 可省略为 `:put rel`，此时取查询输出头）。

来源：`src/cozoscript.pest:167`；省略 schema：`src/parse/query.rs:479-507`；op 解析映射：`src/parse/query.rs:366-377`；op 枚举（共 10 种）：`src/data/program.rs:231-246`

| 操作 | 语义 | 冲突行为 | 来源 |
|---|---|---|---|
| `:put` | **upsert** | key 存在即覆盖，不存在即插入（走 `put_into_relation`，无存在性检查） | `src/query/stored.rs:212-230,332` |
| `:insert` | 插入 | **key 已存在则整语句报错回滚**（`transact::assertion_failure` "key exists in database"）；fork 另拒单语句内重复 key | `src/query/stored.rs:332-345`；错误定义 `:2179-2186`；重复 key 拒绝 `:1439-1441` |
| `:rm` | 按 key 删除 | **key 不存在时静默忽略**（`check_exists=false`） | `src/query/stored.rs:151-164,1968,2026-2039` |
| `:update` | 部分更新 | **key 必须存在**，否则报 "key to update does not exist"；未列出的非 key 列保留原值 | `src/query/stored.rs:668-686`；测试 `src/runtime/tests.rs:491-510` |
| `:delete` | 按 key 删除 | key 不存在则**报错** "key does not exists in database" | `src/query/stored.rs:2032-2038` |
| `:ensure` / `:ensure_not` | 存在性断言 | 不满足则事务失败 | op 枚举 `src/data/program.rs:242-245` |
| `:replace` | 删表重建 | 用查询输出整体替换关系内容 | `src/query/stored.rs:133-134` |
| `:reconcile` | fork 信念替换 | 见 §6.3（限 TxTime 关系） | `src/data/program.rs:234-238` |

真实示例（`:create` + `:put` + `:rm` 三连）。来源：`src/runtime/tests.rs:459-465`：

```cozoscript
?[fr, to, data] <- [[1,2,3],[4,5,6]] :put friends {fr, to => data}
?[fr, to] <- [[1,9],[4,5]] :rm friends {fr, to}
```

### 3.2 事务支持

- **单条脚本原子提交**：写脚本经 `transact_write()` 开启事务，全部执行完才 `commit_tx()`；中途任何错误 → 不提交即回滚。
  来源：`src/runtime/db.rs:1890-1942`（`execute_single`；开启 `:1918-1919`，提交 `:1942`）
- **多语句脚本（imperative，`%if/%loop/%return` 等）同样整体原子**：所有语句共享一个事务，统一提交；源码注释明言 "one tx"。
  来源：`src/runtime/imperative.rs:256-339`（共享 tx `:284-288`，注释 `:289-291`，提交 `:339`）；imperative 语法：`src/cozoscript.pest:270-290`
- **提交唯一入口**：`commit_tx`，注释 "the single commit funnel for every write path"。
  来源：`src/runtime/transact.rs:281-284`
- **脚本语言层面没有显式事务操作**（无 begin/commit/rollback 系统操作）：`::` 系统操作全量枚举中无此类 op。
  来源：`src/cozoscript.pest:14-19`
- **宿主 Rust API 有显式多语句事务**：`db.multi_transaction(true)` → 多次 `tx.run_script(...)` → `tx.commit()` / `tx.abort()`。
  来源：`src/runtime/tests.rs:731-759`（`test_multi_tx`）

---

## 4. 查询语法 `?[...] :=`

### 4.1 脚本与规则形态

一个查询脚本由 ≥1 条规则/常量规则/fixed rule/输出选项组成；`?` 是程序入口规则头。

- 入口：`query_script = {SOI ~ (option | rule | const_rule | fixed_rule)+ ~ EOI}`。
  来源：`src/cozoscript.pest:10`
- 三种规则形态：
  - 普通规则 `rule = {rule_head ~ ":=" ~ rule_body ~ ";"?}` —— `src/cozoscript.pest:88`
  - 常量规则 `const_rule = {rule_head ~ "<-" ~ expr ~ ";"?}` —— `src/cozoscript.pest:89`
  - fixed rule `fixed_rule = {rule_head ~ "<~" ~ compound_ident ~ fixed_args_list ~ ";"?}` —— `src/cozoscript.pest:90`（参数表 `:91,96-102`）
- 规则头：`rule_head = {(prog_entry | ident) ~ "[" ~ (head_arg ~ ",")* ~ head_arg? ~ "]"}`，`prog_entry = {"?"}`；头部聚合：`head_arg = {aggr_arg | var}`，`aggr_arg = {ident ~ "(" ~ var ~ ("," ~ expr)* ~ ")"}`（如 `count(y)`、`collect(y, 10)`；额外参数必须是常量表达式）。
  来源：`src/cozoscript.pest:93-95,77`；解析：`src/parse/query.rs:863-953`（常量参数校验 `:876-878`，未知聚报错 `:858-861`）

### 4.2 规则体 atom（逗号=合取 AND）

`rule_body` 为逗号分隔的 `disjunction`（`atom or atom ...`），atom 共 9 种：

来源：`src/cozoscript.pest:109`（body）、`:115-116`（`or`）、`:117`（atom 分派）；解析：`src/parse/query.rs:619-818`

| atom | 写法 | 来源（pest） |
|---|---|---|
| 关系 atom（具名） | `*rel{col1, col2: var}` | `:111` |
| 关系 atom（位置） | `*rel[a, b]` | `:112` |
| 搜索 atom（HNSW/FTS） | `~rel:idx{cols \| query: v, k: N, ...}` | `:113`（详见 §5.2） |
| 规则调用 | `rule_name[a, b]`（递归=引用自身头名） | `:110` |
| 单值绑定 | `x = <expr>` | `:118` |
| 多值绑定 | `x in [1,2,3]` | `:119-120` |
| 否定 | `not <atom>` | `:121-122` |
| 谓词（过滤） | 裸表达式，如 `x > 1` | `:117`；解析为 `InputAtom::Predicate`：`src/parse/query.rs:669-672` |
| 分组 | `(...)` | `:127` |

- 比较/逻辑运算符（`== != > < >= <= && ||` 等）。来源：`src/cozoscript.pest:129-148`
- 参数 `$param`（作为表达式 term；经 `BTreeMap` 传入）。来源：`src/cozoscript.pest:79,153`；示例 `src/runtime/tests.rs:1629`
- 多规则/递归：同名头规则构成析取规则集；递归即规则体内调用自身。

### 4.3 聚合（用户可用 29 个）

注册表（`parse_aggr` 的 match）：`src/data/aggr.rs:1618-1651`；定义为 `define_aggr!` 宏（`:334-349`）。

| 类别 | 聚合（注册行 :定义行） |
|---|---|
| meet（可入递归，11 个） | `and` :1620/:382、`or` :1621/:430、`union` :1624/:535、`intersection` :1625/:591、`min` :1632/:1016、`max` :1633/:1088、`choice` :1635/:1382、`shortest` :1638/:1323、`min_cost` :1639/:1240、`bit_and` :1640/:1426、`bit_or` :1641/:1505 |
| bounded-meet（可入递归，3 个，fork 新增） | `min_cost_k` :1646/:352、`pareto_min` :1647/:363-371、`pareto_max` :1648/:372-380 |
| 普通（15 个） | `unique` :1622/:471、`group_count` :1623/:489、`count` :1626/:787、`count_unique` :1627/:513、`variance` :1628/:805、`std_dev` :1629/:836、`sum` :1630/:891、`product` :1631/:914、`mean` :1634/:866、`collect` :1636/:673、`interval_coalesce` :1637/:706、`bit_xor` :1642/:1583、`latest_by` :1643/:1160、`smallest_by` :1644/:1200、`choice_rand` :1645/:755 |

（行号均为 `src/data/aggr.rs`。`collect` 支持可选限长参数：`:1745-1761`。）

- **递归中的聚合限制（"safe subset" 的准确含义）**：只有 meet 与 bounded-meet 聚合允许出现在自递归规则头；其他聚合自递归会报 `Query is unstratifiable`。bounded-meet 还必须是头部最后位置的唯一聚合列。
  来源：`src/query/stratify.rs:45-72,90-97`（判定）、`:169-171`（报错）；`src/query/compile.rs:36-46,55-110`（位置约束 `:67-70,87-101`）
- 递归+聚合真实示例（k 短路径 top-k）。来源：`src/runtime/tests.rs:3957-3964`（`sp[t, min_cost(pack)]` 自递归）、`:3974-3980`（`min_cost_k(pack, 2)`）

### 4.4 后置操作与参数

语法集中在 `src/cozoscript.pest:159-189`（`option`），解析 `src/parse/query.rs:264-359`：

- `:limit <expr>` / `:offset <expr>`（常量非负整数）。来源：`src/cozoscript.pest:163-164`；`src/parse/query.rs:321-340`；示例 `src/runtime/tests.rs:68`
- `:sort` 与 `:order` **等价**，`+` 升序（默认）/ `-` 降序前缀，可多列。来源：`src/cozoscript.pest:165,184-187`；`src/parse/query.rs:341-359`；示例 `src/runtime/tests.rs:1718-1719`
- 其他 option：`:timeout`（`src/cozoscript.pest:179`）、`:mem_limit`（`:180`）、`:as_of`（`:182`，见 §6.4）、`:assert none/some`（`:188-189`）、`:returning`（`:166`）、`:reorder`（`:181`）、`:disable_magic_rewrite`（`:162`）。

### 4.5 真实查询示例（引自源码测试）

多规则 join（`test_classical`）。来源：`src/runtime/tests.rs:181-198`：

```cozoscript
parent[] <- [['joseph', 'jakob'],
             ['jakob', 'isaac'],
             ['isaac', 'abraham']]
grandparent[gcld, gp] := parent[gcld, p], parent[p, gp]
?[who] := grandparent[who, 'abraham']
```

聚合（`test_layers`，结果 21）。来源：`src/runtime/tests.rs:132-148`：

```cozoscript
y[a] := a in [1,2,3]
x[sum(a)] := y[a]
x[sum(a)] := a in [4,5,6]
?[sum(a)] := x[a]
```

谓词过滤。来源：`src/runtime/tests.rs:171-172`：

```cozoscript
?[dist] := r['a', dist], dist > 0.5, dist <= 1.1;
```

---

## 5. HNSW 向量索引

### 5.1 向量列类型

- 声明语法：`<F32; 768>`（**不是** `Vector(F32, 768)`）；元素类型 `F32|F64`（别名 `Float|Double`）。
  来源：`src/cozoscript.pest:267-268`；`ColType::Vec`：`src/data/relation.rs:98-101`；`VecElementType`：`src/data/relation.rs:114-120`
- 真实示例：`belief_embedding: <F32; 768>`。来源：`src/runtime/tests.rs:1683`

### 5.2 索引声明 `::hnsw create rel:idx { ... }`

- 语法：`::hnsw create <关系>:<索引名> { 选项: 值, ... }`；删除 `::hnsw drop rel:idx`。
  来源：`src/cozoscript.pest:21,37-38`；配置结构 `HnswIndexConfig`：`src/parse/sys.rs:133-145`

可配置参数全集（解析 `src/parse/sys.rs:762-833`，未知选项报错 `:831`）：

| 选项（别名） | 说明 | 来源（`src/parse/sys.rs`） |
|---|---|---|
| `dim` | 向量维度，正整数 | `:768-775` |
| `dtype` | `F32`/`F64`（`Float`/`Double` 别名）；默认 `F32` | `:796-804,753` |
| `fields` | 被索引的向量列名列表 | `:805-808` |
| `distance`（`dist`） | 仅 `L2` / `IP` / `Cosine`；默认 `L2` | `:809-821,755`；枚举 `:150-154` |
| `ef_construction`（`ef`） | 正整数，**必填** | `:776-785`；必填校验 `:834-836` |
| `m_neighbours`（`m`） | 正整数，**必填** | `:786-795`；必填校验 `:837-839` |
| `filter` | 索引级过滤表达式 | `:822-824` |
| `extend_candidates` | 布尔 | `:825-827` |
| `keep_pruned_connections` | 布尔 | `:828-830` |

### 5.3 相似度查询（专用 search atom，**不是** `<~ hnsw(...)` fixed rule）

- 语法：`~<rel>:<idx>{ 输出列... | query: <向量>, k: N, ef: M, radius?: R, filter?: <expr>, bind_distance: d, bind_vector: v, ... }`
  来源：`src/cozoscript.pest:113`（`search_apply`）、`:84`（`~` 前缀）；解析 `src/parse/query.rs:754-789`；归一化 `HnswSearch`：`src/data/program.rs:1138-1153`
- 查询参数：`query`（必填，`src/data/program.rs:1680-1698`）、`k`（必填正整数，`:1700-1712`）、`ef`（必填正整数，`:1714-1726`）、`radius`（可选正浮点，`:1728-1743`）、`filter`（`:1745`）、`bind_field`/`bind_field_idx`/`bind_distance`/`bind_vector`（`:1747-1798`）；多余参数报错 `:1815-1817`。
- 证据补充：`src/runtime/hnsw.rs` 中无 `FixedRule` 实现，`DEFAULT_FIXED_RULES` 无 `hnsw`（`src/runtime/db.rs:42,415`）——HNSW 查询只能走 `~rel:idx{...}` 语法。

### 5.4 真实示例（引自源码测试）

建索引 + 查询（768 维 Cosine，`hnsw_index` 测试）。来源：`src/runtime/tests.rs:1691-1700,1709-1716`：

```cozoscript
::hnsw create beliefs:embedding_space {
    dim: 768, m: 50, dtype: F32,
    fields: [belief_embedding, details_embedding],
    distance: Cosine, ef_construction: 20,
    extend_candidates: false, keep_pruned_connections: false,
}

?[belief, valence, dist, character_id, vector] :=
    ~beliefs:embedding_space{ belief, valence, character_id |
        query: rand_vec(768), k: 100, ef: 20,
        radius: 1.0, bind_distance: dist, bind_vector: vector }
```

带索引级 `filter` 的简洁示例。来源：`src/runtime/tests.rs:887-897,927`：

```cozoscript
::hnsw create a:vec { dim: 2, m: 50, dtype: F32, fields: [v],
                      distance: L2, ef_construction: 20, filter: k != 'k1' }

?[dist, k, v] := ~a:vec{k, v | query: q, k: 2, ef: 20, bind_distance: dist},
                 q = vec([200, 34])
```

---

## 6. fork 特有能力（均已核实 0.17.0 可用）

### 6.1 `register_custom_aggr`（Rust API）✅

```rust
pub fn register_custom_aggr<F>(&self, name: String, is_meet: bool, factory: F) -> Result<()>
where F: Fn() -> Box<dyn crate::data::aggr::MeetAggrObj> + Send + Sync + 'static;
```

- 来源：`src/runtime/db.rs:1553-1556`（doc 注释 `:1545-1552`，"mnestic fork, provenance semirings R0b"）
- 配套：`unregister_custom_aggr`（`src/runtime/db.rs:1615`）、`register_bounded_meet_aggr`（任意 caller 定义的 Pareto 占优关系，`src/runtime/db.rs:1636`）

### 6.2 `min_cost_k` 聚合 ✅

- 注册：`"min_cost_k" => &AGGR_MIN_COST_K`。来源：`src/data/aggr.rs:1646`；定义 `define_aggr!(AGGR_MIN_COST_K, false, true)`：`src/data/aggr.rs:352`
- 语义：`min_cost_k([payload, cost], k)`——每组保留 k 个最低代价候选（各占一行），附证据链。来源：`src/data/aggr.rs:67-70`（doc）、实现 `:71-97`
- 真实用法。来源：`src/runtime/tests.rs:3737`（`?[g, min_cost_k(pack, 3)] := data[g, pack]`）、`:3778-3781`（递归 k-最短路）

### 6.3 `:reconcile`（信念修正）✅

- 语法：`relation_reconcile = {":reconcile"}`（属 `relation_op`）。来源：`src/cozoscript.pest:171,168`；解析 `src/parse/query.rs:369`
- 语义（枚举 doc）："declare the query output to BE a TxTime relation's new current belief"——声明查询输出为某 TxTime 关系的新当前信念全集，引擎 diff 出 assert/retract。来源：`src/data/program.rs:234-238`
- **限制**：仅限 TxTime 关系；同一事务内 reconcile 后再写该关系报错。来源：`src/query/stored.rs:1090-1110`、`src/runtime/transact.rs:60-66`；校验测试 `src/runtime/tests.rs:4224-4285`
- 真实用法。来源：`src/runtime/tests.rs:4078`（`:reconcile facts {k => v}`）、`:4128`（双时态版 `:reconcile bt {k, vld => v}`）

### 6.4 双时态（bitemporality）✅ 全部可用

- **TxTime 列类型存在**：`ColType::TxTime`——引擎在 commit 时盖章、**用户不可写**（显式给值报 `TxTimeUserSupplied`）、必须是**最后一个 key 列**、至多一个、不可 nullable。
  来源：`src/data/relation.rs:110`（doc `:104-109`）、写入拒绝 `:347-355`；语法 `src/cozoscript.pest:264`；约束测试 `src/runtime/tests.rs:1780-1798`；合法建表 `:1803-1805`（`:create audit {k, tt: TxTime => v: Int}`、`:create belief {e, v: Validity, tt: TxTime => x: Int}`）
- **commit 时钟**：`TtClock` 单调分配提交时间戳。来源：`src/runtime/tt_clock.rs:63,82`
- **`:as_of` 时间旅行读**：查询 option，`:as_of <expr>`；应用到所有 tt atom，查询无 tt 关系时报错。
  来源：`src/cozoscript.pest:182`；解析 `src/parse/query.rs:264-271`；`src/data/program.rs:691-703`；真实示例 `src/runtime/tests.rs:3054-3066`（`?[w] := *audit_a[k, t, w] :as_of {after_audit}`）
- **per-atom 时间选择器**：关系/规则 atom 后可跟 `@ <时间轴>`（双轴写法 `temporal_axes`）。
  来源：`src/cozoscript.pest:104-106`；示例 `@ (tt: 'NOW')` `src/runtime/tests.rs:3066`
- **历史系统操作**：
  - `::history rel keys [limit [offset]]` — 来源：`src/cozoscript.pest:42`；解析 `src/parse/sys.rs:170-187`
  - `::history_gc rel <cutoff_微秒整数>` — 来源：`src/cozoscript.pest:43`；`src/parse/sys.rs:188-198`（cutoff 校验 `:196`）
  - `::evict rel keys [unredacted]` — 来源：`src/cozoscript.pest:44-45`；`src/parse/sys.rs:199-207`
- **Validity 类型**：`pub struct Validity { timestamp: ValidityTs, is_assert: Reverse<bool> }`；写入接受 `[微秒整数, true/false]` 或 `'ASSERT'`/`'RETRACT'`。
  来源：`src/data/value.rs:126-131`；`ColType::Validity` `src/data/relation.rs:103`；语法 `src/cozoscript.pest:263`；写入格式 `src/data/relation.rs:380-406`
- **日历感知 dt_\* 函数库**（13 个，fork 0.13.0 引入）：`dt_year, dt_month, dt_day, dt_hour, dt_minute, dt_second, dt_dow, dt_doy, dt_trunc, dt_add, dt_diff, dt_format, dt_to_validity`。
  来源：注册 `src/data/expr.rs:935-948`；实现 `src/data/functions.rs`（`dt_add` `:2827`、`dt_diff` `:2903`、`dt_format` `:2952`、`dt_to_validity` `:2958-2990`）；`:as_of dt_to_validity(parse_timestamp('2990-01-01T00:00:00Z'))` 桥接示例 `src/data/tests/functions.rs:1982`

---

## 7. 已知限制与坑（均有声明出处）

### 7.1 直接坑使用的（高优先）

1. **批量导入 / 备份恢复都不维护 HNSW/FTS/LSH 索引，必须事后 `::reindex`**。
   > "`::reindex` rebuilds a relation's HNSW / FTS / LSH indexes in place from the configuration the database already stores, so a bulk load or a backup restore (neither of which maintains those indexes) has a repair path…"
   来源：`README-mnestic.md:88-91`
2. **备份/恢复硬依赖 `storage-sqlite` feature**（SQLite 是备份交换格式）。
   来源：`Cargo.toml.orig:108-109`；GitHub README L406-407
3. **0.17.0 的 FTS 整数 boost 会 panic**（如 `Di*^3`），0.18.0 才修复。
   来源：GitHub main README L116（https://raw.githubusercontent.com/shuruheel/mnestic/main/README.md，下同）
4. **`::repair_corrupt` 是有损修复**（直接删除损坏元组）。
   来源：`README-mnestic.md:91-93`
5. **列式导入（columnar-io）只进不出、不推断 schema、不维护索引**。
   来源：`README-mnestic.md:117-119`
6. **发布名与导入名不一致**：装 `mnestic`，写 `use cozo::...`。
   来源：`README-mnestic.md:127`

### 7.2 引擎与 feature 坑

7. **SQLite 后端并发能力弱**；"does not support much concurrency"。来源：`Cargo.toml.orig:35-38`
8. **RocksDB 难编译、资源消耗大、编译耗时长**。来源：`Cargo.toml.orig:41-44,125-126`
   （本工作区实证：开 `storage-rocksdb` 会拉起 `mnestic-rocks → zstd-sys(bindgen)`，**需要本机有 libclang**；当时机器没有，故适配层只开了默认特性。**2026-09-24 更新**：已装用户级 LLVM 22.1.8（`%LOCALAPPDATA%\LLVM\bin\libclang.dll`），设 `LIBCLANG_PATH` 后该 feature 编译通过（2m50s）；适配层已启用 `storage-rocksdb`，`--engine mem|rocksdb` 双模式。）
9. **sled / TiKV 为"高度实验性"，均不支持 time travel**；官方不建议使用。来源：`Cargo.toml.orig:87-99,128`
10. **jemalloc 容易炸构建**。来源：`Cargo.toml.orig:121-123`
11. **构建期版本钉死**：`rayon >=1.10,<1.11`（1.11 破坏 `graph_builder` 0.4.x）、`pest >= 2.8`（`set_error_detail` 是硬依赖）。来源：`Cargo.toml.orig:188-192,155-158`
12. **wasm feature 只是 WASM 编译补丁，需配 `nothread`，其他平台不可用**。来源：`Cargo.toml.orig:79-80,117-119`

### 7.3 安全闸门

13. **`data-import` / `requests` / `rdf-io` 只允许给可信 CozoScript 调用方**（可读进程可达的任意文件/发起外网请求）。来源：`Cargo.toml.orig:49-51,53-64,113-115`
14. **`test-hooks` 禁止生产启用**（每次写提交加锁、可在提交中执行任意代码）。来源：`Cargo.toml.orig:81-85`

### 7.4 版本与升级预警（0.17.0 → 0.18.0）

15. **1.0 前不承诺语法/API/存储兼容**。"Versions before 1.0 do not promise syntax/API stability or storage compatibility." 来源：GitHub main README L455
16. **0.18.0 三类结果级 BREAKING**（升级前必读，当前部署为 0.17.0）：
    - 双引号字符串 `\n` 现在真的是换行（原义反斜杠用 `_"a\nb"_` 或绑定参数）；存量脚本与 stored query 都需审计。来源：GitHub main README L104-107
    - 嵌套 UUID 变字符串、bytes 变 base64 字符串、标量无穷大变 `"INFINITY"`/`"NEGATIVE_INFINITY"`（含新 Json 列写入与 `to_string`）；旧的无穷大派生 null 不可逆。来源：L108-111
    - FTS 前缀应用索引配置的 lowercase/ASCII-fold 过滤器（`Di*` 可匹配 `Diwank`）。来源：L112-115
17. **升级无存储格式迁移**；`\uXXXX` 转义仍只支持 BMP（非 BMP 请用绑定参数）。来源：GitHub main README L118-121
18. **Cypher 查询面是 alpha、只读、默认关闭**（feature `cypher`）。来源：`README-mnestic.md:64-65`；GitHub main README L457-460

### 7.5 上游 issues 现状（2026-09 快照）

- 开放 issue 仅 2 个增强类，无已声明的开放缺陷：**#56** HNSW integrity verification（enhancement，priority: high）、**#57** evidence-gated vector quantization（enhancement）。已关闭的 #53/#54/#55 即 0.18.0 三条 BREAKING 修复的出处。
  来源：https://api.github.com/repos/shuruheel/mnestic/issues?state=all&per_page=20

### 7.6 本工作区部署限定（非上游声明）

- 当前实例默认 **Mem 引擎，进程退出即丢数据**（`persistent: false`）；2026-09-24 起 `scripts/mnestic_start.sh --rocks` 可切 RocksDB 持久化（`persistent: true`，数据目录 `.data/mnestic`）。
- HTTP 面**无 WebSocket、无鉴权**（适配层 `server/src/main.rs` 实现；token 字段仅为预留，见 `cordis.patch.yml`）。
- 默认绑定 `127.0.0.1`（来源：`main.rs:29`），端口默认 9070，`--port` 可改。

---

## 8. 补遗（2026-09-24，Day 4 HNSW 实证）

> 本节为速查后的运行实证补遗，每条均在本工作区实例（0.17.0，rocksdb 模式）实测。

1. **索引声明与回读**：`schema/01_facts.cozo` 末行声明 `::hnsw create facts:embedding_hnsw {dim: 1024, m: 32, dtype: F32, fields: [embedding], distance: Cosine, ef_construction: 128}`；`::indices facts` 回读配置一致（`m_max=32, m_max0=64, vec_dim=1024, distance=Cosine, dtype=F32`）。**维度 1024（F32），距离度量 Cosine**（mnestic 支持集 L2/IP/Cosine，见 §5.2）。
2. **写入形态**：`embedding: <F32; 1024>?` 列在 `:put` 时**直接接受自然 JSON 数字数组参数**（长度须=1024），列类型自动收编为 Vec<F32>（实测 `:put` 返回 OK，回读为 1024 长度数组）；HNSW 索引随 `:put` 正常维护（非批量导入路径，不适用 §7.1-1 的 `::reindex` 约束）。
3. **查询形态（坑）**：HNSW search atom 的 `query:` 字段**必须给 Vec 类型**——裸 JSON 数组参数被转为 List，报 `Expected vector, got [...]`；正确形态为 `query: vec($v)`（`vec()` 由 List 构造 Vec）。实测可用形态：
   ```cozoscript
   ?[id, predicate, args, dist] := ~facts:embedding_hnsw{id, predicate, args |
       query: vec($v), k: 5, ef: 20, bind_distance: dist}
   ```
4. **性能注记**：HNSW 索引逐向量维护成本高，`:put` 多行回填实测约 **4 向量/s**（3506 行全量回填约 12–15 分钟）；大批量回填需调大客户端 timeout（本仓脚本用 120s）并分批（25 行/批）。
5. **冒烟记录**：3506 行 facts 全量回填伪随机向量（种子 42，`scripts/backfill_embedding.ts`）后，取 `composition(S01,…)` 的向量做 k=5 查询：返回 5 行含自身（dist=0）+ 4 个最近邻，格式正确（伪随机向量无语义，仅验证索引机制）。回填行 `eps_source="placeholder-random-seed42"`（验收 C6 口径，Phase 4 按此标记批量重算）。

---

## 9. 补遗（2026-10-31，Phase 1 查询探针）

> 以下均在 RocksDB 实例 `127.0.0.1:9070` 实测，原始响应已核对。

1. **`to_float` 可用**：`?[x] := x = to_float("0.06")` 返回数值 `0.06`，可用于后续描述符数值比较；R4 的 `delta>0.06` 查询仍待规则解除阻塞。
2. **多 `*facts` atom 自连接可用**，`first()` / `get()` 可解构 args：
   ```cozoscript
   ?[alloy, v2, original] := *facts{predicate: p1, args: a1},
     p1 == "ref_smix_v2", alloy = first(a1), v2 = get(a1, 1),
     *facts{predicate: p2, args: a2}, p2 == "ref_smix",
     first(a2) == alloy, original = get(a2, 1), alloy == "HEAL0001"
   ```
   返回 `HEAL0001 / 12.319371485662288 / 12.31969725176659`。
3. **派生与 J 边集成实证**：`tests/closure.test.ts` 在真实 Mem 实例覆盖 R1/R2/R3、重复闭包 fact/J 边不重复、R4 激活拦截及 v3 option/subtask/model 入库；2026-10-31 全套 16 用例通过。

---

*取证说明：未标注 URL 的行号均相对于本地 crate 根 `mnestic-0.17.0/`（cargo registry 缓存）；`main.rs` 行号相对于 `server/`；GitHub README 行号以 raw 文本计。生成日期：2026-09-13。*
