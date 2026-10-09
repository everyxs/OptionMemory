# HEA-Lens-1540 数据勘察与映射（Day 1）

跑数代码：`scripts/survey_hea_lens.py`（Python 3.14.2 + pandas 3.0.2）。

```bash
python scripts/survey_hea_lens.py        # 默认读原始 1540 行版；可传其他 CSV 路径
```

- 数据集目录：`D:\codeRepos\personalKB\students\04-创造层\项目\26-04 AI4Science\datasets\`
- 勘察对象：**`commercial_alloys_high_entropy_lens_composition_dataset.csv`**（原始 1540 行版——「HEA-Lens-1540」的 1540、§2.1 的 839 跳过行均对应它）。
- 对照：`*_cleaned.csv` 同为 1540 行 × 42 列（清洗版未删任何行——不存在"完全空行"可移除；行序与原始版一致）。**导入应以原始版为准，行序即 HEAL 编号序。**
- 读取口径：全部单元格按原始字符串读入（`dtype=str`），数值检查用显式 `float()` 解析；成分串拼接用原始文本，不经 float 格式化。

## 1. 总行数 / 列数 / 列名清单

**1540 行 × 42 列**。列清单（下标为 CSV 列序）：

| 类别 | 列（CSV 序） |
|---|---|
| 标识 ×3 | `[00] Alloy Name`、`[01] Descriptive Name`、`[02] Concentrated EL` |
| 元素 ×36 | `[03..38] Ag Al Au Be C Ce Co Cr Cu Fe Hf In Ir Li Mg Mn Mo N Nb Ni P Pb Pd Pt Re Rh Ru Si Sn Ta Ti V W Y Zn Zr` |
| 描述符 ×2 | `[39] Smix_ideal`、`[40] lattice_distortion_parameter_delta` |
| 来源 ×1 | `[41] References` |

36 个元素列与数据字典定义**一一对应，无缺失、无多余**。

## 2. 36 元素列缺失模式

| 项 | 行数 |
|---|---|
| 36 列全缺失（跳过不导入） | **839** |
| 有成分数据（可导入） | **701**（与预期约 701 一致） |
| 其中 36 列齐全 | 701 |
| 其中部分列缺失 | **0** |

- 缺失是**全有或全无**：不存在"部分元素列缺失"的行，可导入行 36 列齐全（缺席元素以 `0.0` 显式填 0）。
- 缺失行索引范围 `[453..1353]`，**非连续块**（与正常行交错分布）。
- `Alloy Name` 缺失与成分全缺失**完全同行**（839=839），无"有名无成分"或"有成分无名"的边角行。

## 3. 成分数值格式

- **百分数（at.%）**：701 个可导入行的成分合计 **min = median = max = 100.0000**（每行精确合计 100）。
- 单元素值范围 `0.0 ~ 96.24`。
- **非数字单元格：0 个**（全部可 `float()` 解析）。

## 4. 描述符缺失率与取值范围

| 列 | 缺失 | 缺失率 | min | max |
|---|---|---|---|---|
| `Smix_ideal` | 12 | 0.78% | 0.008489 | 18.215303 |
| `lattice_distortion_parameter_delta` | 12 | 0.78% | 8.497e-05 | 0.121654 |

关键：**12 个缺失行全部落在 839 个跳过行内**——701 个可导入行的两个描述符**无一缺失**（见 §7 计数）。

## 5. Alloy Name 检查

- 非空 701，去重后 691 —— **10 个名称各重复 2 次**（涉及 20 行），全部为商用钢牌号类长名，如：
  - `Stainless steel, austenitic, ASTM XM-29 (Nitronic 33)` ×2
  - `HSLA Steel Fe-9Ni` ×2
  - `Stainless steel, austenitic-martensitic-precipitation hardenable, CIS 07X16H6M` ×2 等
- 含引号 / 反斜杠 / 换行：**0**；含非 ASCII 字符：**0**。无需转义。
- 影响：HEAL 编号按行序产生，不受重名影响；但 `alloy_name` 反查会有双命中（见 §8-f）。

## 6. 前 5 行转换对照样例（模拟 §2.1 映射）

HEAL 序号按**可导入行顺序**编排（跳过行不占号，见 §8-d）。样例逐字取自跑数输出：

```
CSV 行 0 → HEAL0001  Alloy Name='Al0.2 Cr0.667 Fe1 Mn0.667 Ni0.333'
  alloy_name(HEAL0001, "Al0.2 Cr0.667 Fe1 Mn0.667 Ni0.333")
  composition(HEAL0001, "Al6.99Cr23.28Fe34.86Mn23.28Ni11.59")
  ref_smix(HEAL0001, "12.31969725176659")
  ref_delta(HEAL0001, "0.019037332638094")
  source_ref(HEAL0001, "doi:10.1038/s41597-020-00768-9")
CSV 行 1 → HEAL0002  Alloy Name='Co35Cr25Fe20Ni20'
  alloy_name(HEAL0002, "Co35Cr25Fe20Ni20")
  composition(HEAL0002, "Co35.0Cr25.0Fe20.0Ni20.0")
  ref_smix(HEAL0002, "11.2892615330467")
  ref_delta(HEAL0002, "0.0123753175818414")
  source_ref(HEAL0002, "doi:10.1080/21663831.2018.1553803")
CSV 行 2 → HEAL0003  Alloy Name='Co45Cr25Fe15Ni15'
  alloy_name(HEAL0003, "Co45Cr25Fe15Ni15")
  composition(HEAL0003, "Co45.0Cr25.0Fe15.0Ni15.0")
  ref_smix(HEAL0003, "10.60125285725217")
  ref_delta(HEAL0003, "0.0120752652504254")
  source_ref(HEAL0003, "doi:10.1080/21663831.2018.1553803")
CSV 行 3 → HEAL0004  Alloy Name='Al0.3CoCrFeNi'
  alloy_name(HEAL0004, "Al6.98Co23.25Cr23.25Fe23.26Ni23.26")
  ref_smix(HEAL0004, "12.82618130630103")
  ref_delta(HEAL0004, "0.0216517883449819")
  source_ref(HEAL0004, "doi:10.1016/j.actamat.2021.116938")
CSV 行 4 → HEAL0005  Alloy Name='Al0.25CoFeNi'
  alloy_name(HEAL0005, "Al7.69Co30.77Fe30.77Ni30.77")
  ref_smix(HEAL0005, "10.68625141485859")
  ref_delta(HEAL0005, "0.0216206079031571")
  source_ref(HEAL0005, "doi:10.1016/j.actamat.2021.116938")
```

成分串格式与 S01 一致（元素符号+原始数值文本拼接，仅保留 at.% > 0，按 CSV 列序）。

## 7. 导入量预估（701 个可导入行）

| 谓词 | facts 数 | 说明 |
|---|---|---|
| `alloy_name` | 701 | |
| `composition` | 701 | Phase 1 闭包推导输入 |
| `ref_smix` | 701 | 对拍参考值 |
| `ref_delta` | 701 | 对拍参考值 |
| `source_ref` | **698** | 3 个可导入行 `References` 为空，不出此 fact |
| **合计** | **3502** | |

`References` 中 DOI 形态（`^10\.\d{4,}/`，按 §2.1 样例加 `doi:` 前缀）：**652 / 698**；其余 46 条非 DOI 形态，保持原文（见 §8-e）。

## 8. 决策记录与遗留项（原待决项）

> **Day 2 导入已完成（2026-09-24）**：3502 条 facts 经 `memory_set_batch`（ν 门）落库；计数（composition 702）、分谓词核对、首/中/尾 3 个 alloy 成分抽查、幂等重跑（inserted=0 / skipped=3502）全部通过。导入脚本：`scripts/import_hea_lens.ts`（`--dry-run` 可复现 §6 样例）。

- **a. ~~`status="in"` 与现有代码冲突（阻塞）~~ 已决（2026-09-24，ADR-0002）**：`FACT_STATUSES` 定为 `["in","out","archived","contested"]`（与手册 §2.1 对齐，取代 ADR-0001 的三值），缺省 `"in"`，见 `docs/decisions/0002-fact-status-vocabulary-manual-alignment.md`。§2.1 的 `status="in"` 可直接导入。
- **b. `layer="knowledge"` 不在占位层表**：`MEMORY_LAYERS = working/episodic/semantic/procedural/meta`（占位定义）。ν 门不校验层词汇，不阻塞；但层词汇表需在设计文档补登 `"knowledge"`。
- **c. §2.1 未给定的必填字段占位 —— 已认可（2026-09-24）**：`epsValue=0.5`、`linVersion="1.0"`、`linActor="import_hea_lens"`。
- **d. HEAL 编号口径 —— 已认可（2026-09-24）**：按「可导入行顺序编号，跳过行不占号」（HEAL0001..HEAL0701）。
- **e. `source_ref` 的 `doi:` 前缀 —— 已认可（2026-09-24）**：仅对 DOI 形态值加前缀（652 条）；46 条非 DOI 形态原样保留。
- **f. 重名合金 10 组**：不影响按行序的 HEAL 编号；但 `alloy_name` 谓词反查（名→id）不唯一，实体对齐场景需注意。
- **g. 3 行缺 `References`**：对应行只出 4 条 facts（无 `source_ref`），已计入 §7。
