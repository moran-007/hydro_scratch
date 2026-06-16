from __future__ import annotations

import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_JSON = ROOT / "docs" / "scratch-algorithm-ask-answer-test-20260616.json"
OUT_DIR = ROOT / "docs" / "scratch-algorithm-packages-20260616"
PACKAGE_DATE = "20260616"
TITLE_PREFIX = f"Codex测试-{PACKAGE_DATE}"


def yaml_scalar(value: object) -> str:
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def build_problem_yaml(problem: dict[str, object], package_pid: str) -> str:
    title = f"{TITLE_PREFIX}-{problem['pid']}-{problem['title']}"
    return "\n".join(
        [
            "format: hydro-scratch-problem",
            "version: 1",
            f"pid: {package_pid}",
            f"title: {yaml_scalar(title)}",
            "hidden: false",
            "tags:",
            "  - Scratch",
            "  - 算法题",
            "  - Codex测试",
            "scratch:",
            "  enabled: true",
            "  problemKind: algorithm",
            "  submitMode: both",
            "  judgeMode: dynamic",
            "  maxScore: 100",
            "  allowDownloadTemplate: false",
            "  disabledScratchExtensions:",
            "    - videoSensing",
            "  limits:",
            "    maxProjectSizeMB: 20",
            "    maxUnpackedSizeMB: 80",
            "    maxAssetSizeMB: 10",
            "    maxAssetCount: 300",
            "    maxProjectJsonSizeMB: 10",
            "",
        ]
    )


def build_statement(problem: dict[str, object]) -> str:
    ask_flow = "\n".join(f"{index}. {item}" for index, item in enumerate(problem["askFlow"], 1))
    public_rows = []
    hidden_count = 0
    cases = problem["judgeConfig"]["algorithm"]["cases"]
    for case in cases:
        if case.get("hidden"):
            hidden_count += 1
            continue
        case_input = str(case["input"]).replace("\n", "\\n")
        public_rows.append(
            f"| {case['name']} | `{case_input}` | `{case['expectedOutput']}` | {case['score']} |"
        )
    public_table = "\n".join(public_rows)
    return f"""# {TITLE_PREFIX}-{problem['pid']}-{problem['title']}

## 题目目标

{problem['goal']}

## Scratch 输入输出约定

本题按 Scratch 常见的“询问并等待 / 答案”方式完成。

请在程序中按下面顺序询问用户，并把每次回答保存到变量中：

{ask_flow}

最后请把纯答案写入 Scratch 变量 `output`。自动评测会把测试输入放入 `input`，点击绿旗运行后读取 `output`。

## 输出要求

{problem['outputRule']}

比较方式：`{problem['compareMode']}`。

## 公开样例

| 用例 | 输入回答序列 | 期望 output | 分值 |
| --- | --- | --- | --- |
{public_table}

另有 {hidden_count} 个隐藏测试点用于检查边界情况。

## 提交要求

提交 `.sb3` Scratch 作品，作品中应包含变量 `input` 和 `output`。如果使用在线编辑器作答，请保存后提交。
"""


def build_readme(rows: list[tuple[str, str, str]]) -> str:
    package_rows = "\n".join(f"| {pid} | {title} | `{filename}` |" for pid, title, filename in rows)
    return f"""# Scratch 算法题题目包（{PACKAGE_DATE}）

这些 ZIP 包用于 Hydro Scratch 插件的“导入 Scratch 题目包”功能。每个 ZIP 的根目录都直接包含：

- `problem.yaml`
- `statement.md`
- `scratch-judge.json`

导入入口：`/d/scratch/scratch/problem/import`。

| PID | 标题 | ZIP |
| --- | --- | --- |
{package_rows}
"""


def main() -> None:
    data = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[tuple[str, str, str]] = []

    for index, problem in enumerate(data["problems"], 1):
        package_pid = f"codexsa{index:02d}"
        filename = f"{package_pid}-{PACKAGE_DATE}.scratch-problem.zip"
        zip_path = OUT_DIR / filename
        judge_config = problem["judgeConfig"]
        judge_config["problemId"] = package_pid
        judge_config["title"] = f"{TITLE_PREFIX}-{problem['pid']}-{problem['title']}"

        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("problem.yaml", build_problem_yaml(problem, package_pid).encode("utf-8"))
            archive.writestr("statement.md", build_statement(problem).encode("utf-8"))
            archive.writestr(
                "scratch-judge.json",
                json.dumps(judge_config, ensure_ascii=False, indent=2).encode("utf-8"),
            )

        rows.append((package_pid, str(problem["title"]), filename))

    readme_path = OUT_DIR / "README.md"
    readme_path.write_text(build_readme(rows), encoding="utf-8")

    print(f"Generated {len(rows)} packages in {OUT_DIR}")
    for pid, title, filename in rows:
        print(f"{pid}\t{title}\t{filename}")


if __name__ == "__main__":
    main()
