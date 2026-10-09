#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""survey_hea_lens.py —— HEA-Lens-1540 数据勘察（路线图 Day 1 / 手册 §2.1）。

用法：
    python scripts/survey_hea_lens.py [csv路径]
默认读原始数据集（1540 行版）；全部单元格按原始字符串读入（dtype=str），
数值检查用显式 float() 解析，成分串拼接使用原始文本（避免 float 格式化失真）。

输出 7 节，对应勘察报告 6 个必答问题 + 导入量预估。
"""
import re
import sys
from pathlib import Path

import pandas as pd

DEFAULT_CSV = Path(
    r"D:\codeRepos\personalKB\students\04-创造层\项目\26-04 AI4Science"
    r"\datasets\commercial_alloys_high_entropy_lens_composition_dataset.csv"
)

# 数据字典定义的 36 个元素列（顺序即 CSV 列序，成分串按此序拼接）。
ELEMENTS = [
    "Ag", "Al", "Au", "Be", "C", "Ce", "Co", "Cr", "Cu", "Fe", "Hf", "In",
    "Ir", "Li", "Mg", "Mn", "Mo", "N", "Nb", "Ni", "P", "Pb", "Pd", "Pt",
    "Re", "Rh", "Ru", "Si", "Sn", "Ta", "Ti", "V", "W", "Y", "Zn", "Zr",
]

DOI_RE = re.compile(r"^10\.\d{4,}/")


def parse_cell(s: str):
    """返回 (kind, value)：kind ∈ missing / num / bad。"""
    t = s.strip()
    if t == "":
        return "missing", None
    try:
        return "num", float(t)
    except ValueError:
        return "bad", None


def composition_string(row: pd.Series, elem_cols: list) -> str:
    """手册 §2.1：元素符号+数值拼接，仅保留 at.% > 0 的元素，按 CSV 列序。"""
    parts = []
    for c in elem_cols:
        kind, v = parse_cell(row[c])
        if kind == "num" and v > 0:
            parts.append(f"{c}{row[c].strip()}")
    return "".join(parts)


def main() -> None:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    print(f"# 文件: {csv_path}")

    # ---------- §1 总行数 / 列数 / 列名 ----------
    print("\n## §1 规模与列清单")
    print(f"rows={len(df)}  cols={len(df.columns)}")
    for i, c in enumerate(df.columns):
        print(f"  [{i:02d}] {c}")

    elem_cols = [c for c in df.columns if c in ELEMENTS]
    non_elem = [c for c in df.columns if c not in ELEMENTS]
    missing_defs = [e for e in ELEMENTS if e not in df.columns]
    print(f"\nelement_cols={len(elem_cols)} (字典定义 36)")
    print(f"字典有而 CSV 缺: {missing_defs or '无'}")
    print(f"非元素列 ({len(non_elem)}): {non_elem}")

    # ---------- §2 元素列缺失模式 ----------
    print("\n## §2 元素列缺失模式")
    cell = df[elem_cols].map(lambda s: parse_cell(s)[0])
    n_missing = (cell == "missing").sum(axis=1)
    all_missing = n_missing == len(elem_cols)
    importable = ~all_missing
    partial = importable & (n_missing > 0)
    print(f"全部 36 列缺失（跳过）: {int(all_missing.sum())}")
    print(f"有成分数据（可导入）  : {int(importable.sum())}")
    print(f"  其中 36 列齐全      : {int((importable & (n_missing == 0)).sum())}")
    print(f"  其中部分列缺失      : {int(partial.sum())}")
    idx = df.index[all_missing]
    if len(idx):
        print(f"缺失行索引范围: [{idx.min()}..{idx.max()}]，"
              f"连续块={bool((idx.to_series().diff().dropna() == 1).all())}")
    name_missing = df["Alloy Name"].str.strip() == ""
    print(f"Alloy Name 缺失: {int(name_missing.sum())}；"
          f"与成分全缺失同行的行数: {int((name_missing & all_missing).sum())}")
    print(f"Alloy Name 缺失但成分在: {int((name_missing & importable).sum())}；"
          f"成分缺失但 Alloy Name 在: {int((~name_missing & all_missing).sum())}")

    # ---------- §3 成分数值格式 ----------
    print("\n## §3 成分数值格式（at.% 百分数 or 小数；非数字单元格）")
    parsed = df[elem_cols].map(parse_cell)
    kinds = parsed.map(lambda t: t[0])
    bad = kinds == "bad"
    print(f"非数字单元格: {int(bad.to_numpy().sum())}")
    if bad.to_numpy().any():
        for c in elem_cols:
            for i in df.index[bad[c]][:5]:
                print(f"  bad cell row={i} col={c} raw={df.at[i, c]!r}")
    vals = parsed.map(lambda t: t[1] if t[1] is not None else float("nan"))
    flat = vals.to_numpy().ravel()
    flat = flat[flat == flat]  # 去 NaN
    print(f"数值单元格 min={flat.min()}  max={flat.max()}")
    row_sum = vals.fillna(0.0).sum(axis=1)
    s = row_sum[importable]
    print(f"可导入行成分合计: min={s.min():.4f}  median={s.median():.4f}  max={s.max():.4f}")
    print("判定: 百分数（合计≈100）" if abs(s.median() - 100) < 5 else "判定: 需人工复核")

    # ---------- §4 描述符缺失率与范围 ----------
    print("\n## §4 Smix_ideal / lattice_distortion_parameter_delta")
    for c in ["Smix_ideal", "lattice_distortion_parameter_delta"]:
        p = df[c].map(parse_cell)
        k = p.map(lambda t: t[0])
        v = p.map(lambda t: t[1])
        nv = v.dropna()
        print(f"{c}: missing={int((k == 'missing').sum())} "
              f"({(k == 'missing').mean() * 100:.2f}%)  bad={int((k == 'bad').sum())}  "
              f"min={nv.min()}  max={nv.max()}")

    # ---------- §5 Alloy Name 重复与转义 ----------
    print("\n## §5 Alloy Name")
    names = df.loc[~name_missing, "Alloy Name"]
    print(f"非空: {len(names)}  去重后: {names.nunique()}")
    dup = names[names.duplicated(keep=False)]
    print(f"参与重复的名称数: {dup.nunique()}，涉及行数: {len(dup)}")
    if len(dup):
        for nm, cnt in dup.value_counts().head(10).items():
            print(f"  x{cnt}  {nm!r}")
    risky = names[names.str.contains(r'["\\\n\r]', regex=True)]
    non_ascii = names[names.map(lambda s: any(ord(ch) > 127 for ch in s))]
    print(f"含引号/反斜杠/换行: {len(risky)}")
    for nm in risky.head(5):
        print(f"  {nm!r}")
    print(f"含非 ASCII 字符: {len(non_ascii)}")
    for nm in non_ascii.head(5):
        print(f"  {nm!r}")

    # ---------- §6 前 5 个可导入行转换样例 ----------
    print("\n## §6 前 5 个可导入行 → facts 样例（HEAL 序号按可导入行顺序编排）")
    imp = df.index[importable]
    for n, i in enumerate(imp[:5], start=1):
        row = df.loc[i]
        hid = f"HEAL{n:04d}"
        comp = composition_string(row, elem_cols)
        ref = row["References"].strip()
        src = f"doi:{ref}" if DOI_RE.match(ref) else ref
        print(f"CSV 行 {i} → {hid}  Alloy Name={row['Alloy Name']!r}")
        print(f'  alloy_name({hid}, "{row["Alloy Name"].strip()}")')
        print(f'  composition({hid}, "{comp}")')
        print(f'  ref_smix({hid}, "{row["Smix_ideal"].strip()}")')
        print(f'  ref_delta({hid}, "{row["lattice_distortion_parameter_delta"].strip()}")')
        print(f'  source_ref({hid}, "{src}")')

    # ---------- §7 导入量预估 ----------
    print("\n## §7 导入量预估（可导入行内各谓词非空计数）")
    imp_df = df.loc[importable]
    refs = imp_df["References"].str.strip()
    doi_like = int(refs.map(lambda s: bool(DOI_RE.match(s))).sum())
    counts = {
        "alloy_name": int((imp_df["Alloy Name"].str.strip() != "").sum()),
        "composition": int(importable.sum()),
        "ref_smix": int((imp_df["Smix_ideal"].str.strip() != "").sum()),
        "ref_delta": int((imp_df["lattice_distortion_parameter_delta"].str.strip() != "").sum()),
        "source_ref": int((refs != "").sum()),
    }
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print(f"  合计 facts: {sum(counts.values())}")
    print(f"  References 中 DOI 形态（加 doi: 前缀）: {doi_like} / {counts['source_ref']}")

    # 对照：cleaned 版本规模
    cleaned = csv_path.with_name(csv_path.name.replace(".csv", "_cleaned.csv"))
    if cleaned.exists():
        dfc = pd.read_csv(cleaned, dtype=str, keep_default_na=False)
        print(f"\n对照 cleaned 版: rows={len(dfc)} cols={len(dfc.columns)}")


if __name__ == "__main__":
    main()
