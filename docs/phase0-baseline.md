# Phase 0 性能基线报告

- 日期：2026-10-07（跑数时间）
- 数据集规模：facts **3506 行**（S01×4 + HEA-Lens-1540 导入 3502），全部含 1024 维伪随机 embedding（种子 42）
- 实例：mnestic 0.17.0，**RocksDB 持久化模式**（`.data/mnestic`），HTTP `127.0.0.1:9070`

## 环境

| 项 | 值 |
|---|---|
| CPU | Intel Core Ultra 9 275HX |
| 内存 | ~31.4 GB |
| OS | Windows 11 |
| Node | v24.13.0 |
| 适配层 | `mnestic-mem-adapter` debug 构建（dev profile，rustc 1.98.0；**未开 release 优化，数值偏保守**） |
| 链路 | 本机 loopback HTTP（`POST /text-query`），延迟为端到端值 |

## 测量方法

每项 **3 轮取中位数**（写入类再报全样本 p50/max）；脚本 `scripts/bench_phase0.ts`，测量产生的临时行（`predicate="bench_write"`，共 330 行）在测量后全部 `:rm`，行数校验恢复 3506。
复现：`node scripts/bench_phase0.ts`（前提：9070 实例在跑、数据已导入回填）。

## 数值表

| # | 指标 | 中位数 | 明细 | 参考线（手册 §5.2 #8） | 判定 |
|---|---|---|---|---|---|
| 1 | 单条 `memory_set` 写入延迟 | **5.9 ms** | p50 5.9 / max 27.5（30 样本） | < 100 ms | ✓ |
| 2 | `memory_set_batch` 吞吐（100 条/批） | **490 条/s** | 489 / 490 / 543 条/s（批均 ~200 ms/100 条） | > 50 条/s | ✓ |
| 3 | 谓词过滤查询（composition 全量扫描，702 行物化） | **42.9 ms** | — | — | ✓ |
| 4 | hnsw k=5（S01 向量，Cosine，3506×1024 维） | **121.7 ms** | — | — | ✓ |
| 5 | RocksDB 数据目录磁盘占用 | **94 MB**（du；apparent 74 MB） | 含 3506 行 + HNSW 索引 | — | 记录 |

## 备注

- 指标 4 的 121.7 ms 为 debug 构建 + Cosine 全图搜索的保守值；HNSW 索引维护成本集中在写入侧（回填实测约 4 向量/s，见 cheatsheet §8-4），读侧查询与写入路径互不影响。
- 指标 1 的写入含 HNSW 空向量列维护开销（bench 行 embedding=null，开销主要在 facts 行写入 + 谓词/状态索引）。
- debug → release 构建的潜在提升未测量（当前适配层以 dev profile 运行）；如需更优基线，`cargo build --release` 后复测本表。
