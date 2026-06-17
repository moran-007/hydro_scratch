from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated" / "leledati-derived-scratch-bank-20260617"


LIMITS = {
    "maxProjectSizeMB": 20,
    "maxUnpackedSizeMB": 80,
    "maxAssetSizeMB": 10,
    "maxAssetCount": 300,
    "maxProjectJsonSizeMB": 10,
}


def q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def check(name: str, score: int, type_: str, **extra: Any) -> dict[str, Any]:
    return {"name": name, "score": score, "type": type_, **extra}


def task_config(title: str, static_checks: list[dict[str, Any]], structure_checks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "title": title,
        "totalScore": 100,
        "staticChecks": static_checks,
        "structureChecks": structure_checks or [],
        "dynamicChecks": [],
    }


def algorithm_config(title: str, algorithm: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "title": title,
        "totalScore": 100,
        "staticChecks": [],
        "structureChecks": [],
        "dynamicChecks": [],
        "algorithm": {
            "waitMs": 1600,
            "timeoutMs": 8000,
            "compareMode": "exact",
            **algorithm,
        },
    }


PROBLEMS: list[dict[str, Any]] = [
    {
        "pid": "llscratcht01",
        "title": "星际航线定位",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "角色移动"],
        "statement": """# 星际航线定位

请制作一个飞船定位小任务。

## 准备工作

1. 删除默认小猫，添加或绘制一个飞船角色，并把角色命名为 `Player`。
2. 添加一个星星角色，并把角色命名为 `Star`。
3. 新建变量 `score`。

## 功能要求

1. 点击绿旗后，先把 `score` 设为 `0`。
2. `Player` 从舞台左侧出发，先移动到 `x=-120, y=60`，再移动到 `x=80, y=-30`。
3. 到达终点后，把 `score` 设为 `100`。
4. 程序中需要使用移动、坐标定位和变量赋值相关积木。

## 评分说明

本题按任务点评分，会检查角色、变量和关键积木是否按要求出现。""",
        "judge": task_config(
            "星际航线定位",
            [
                check("存在 Player 飞船角色", 15, "sprite_exists", sprite="Player"),
                check("存在 Star 星星角色", 10, "sprite_exists", sprite="Star"),
                check("存在 score 变量", 15, "variable_exists", variable="score"),
                check("使用绿旗开始程序", 15, "block_exists", opcode="event_whenflagclicked"),
                check("使用坐标定位积木", 20, "block_exists", opcode="motion_gotoxy"),
                check("使用变量赋值积木", 15, "block_exists", opcode="data_setvariableto"),
                check("至少使用两次坐标定位", 10, "min_block_count", opcode="motion_gotoxy", count=2),
            ],
            [
                check(
                    "Player 有绿旗脚本",
                    0,
                    "target_script_exists",
                    target="Player",
                    hat="event_whenflagclicked",
                ),
            ],
        ),
    },
    {
        "pid": "llscratcht02",
        "title": "派对礼物变装",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "造型"],
        "statement": """# 派对礼物变装

请制作一个礼物盒变装小程序。

## 准备工作

1. 删除默认小猫，添加一个礼物角色并命名为 `Gift`。
2. 给 `Gift` 准备至少 3 个不同造型。
3. 新建变量 `changeCount`。

## 功能要求

1. 点击绿旗后，`changeCount` 设为 `0`。
2. 礼物角色每隔一小段时间切换一次造型。
3. 每切换一次造型，`changeCount` 增加 `1`。
4. 至少重复切换 3 次。

## 评分说明

系统会检查角色命名、变量和造型切换相关积木。""",
        "judge": task_config(
            "派对礼物变装",
            [
                check("存在 Gift 角色", 20, "sprite_exists", sprite="Gift"),
                check("存在 changeCount 变量", 15, "variable_exists", variable="changeCount"),
                check("使用绿旗积木", 10, "block_exists", opcode="event_whenflagclicked"),
                check("使用切换造型积木", 20, "block_exists_any", opcodes=["looks_switchcostumeto", "looks_nextcostume"]),
                check("使用等待积木", 10, "block_exists", opcode="control_wait"),
                check("使用重复执行积木", 10, "block_exists_any", opcodes=["control_repeat", "control_forever"]),
                check("使用变量增加积木", 15, "block_exists", opcode="data_changevariableby"),
            ],
        ),
    },
    {
        "pid": "llscratcht03",
        "title": "森林小鸟接力飞行",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "循环"],
        "statement": """# 森林小鸟接力飞行

请制作一个小鸟按路线飞行的程序。

## 准备工作

1. 保留或添加一个小鸟角色，命名为 `Bird`。
2. 添加树木或终点角色，命名为 `Tree`。
3. 新建变量 `steps`。

## 功能要求

1. 点击绿旗后，`steps` 设为 `0`。
2. `Bird` 依次滑行到 3 个不同位置。
3. 每到达一个位置，`steps` 增加 `1`。
4. 最后让小鸟说出“飞行完成”。

## 评分说明

系统会检查角色、变量、滑行、循环或多段移动相关积木。""",
        "judge": task_config(
            "森林小鸟接力飞行",
            [
                check("存在 Bird 角色", 15, "sprite_exists", sprite="Bird"),
                check("存在 Tree 角色", 10, "sprite_exists", sprite="Tree"),
                check("存在 steps 变量", 15, "variable_exists", variable="steps"),
                check("使用绿旗积木", 10, "block_exists", opcode="event_whenflagclicked"),
                check("使用滑行积木", 20, "block_exists", opcode="motion_glidesecstoxy"),
                check("至少三段滑行", 15, "min_block_count", opcode="motion_glidesecstoxy", count=3),
                check("使用说话积木", 15, "block_exists_any", opcodes=["looks_say", "looks_sayforsecs"]),
            ],
        ),
    },
    {
        "pid": "llscratcht04",
        "title": "键盘赛车训练",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "键盘控制"],
        "statement": """# 键盘赛车训练

请制作一个键盘控制赛车的程序。

## 准备工作

1. 添加赛车角色，命名为 `Car`。
2. 新建变量 `distance`。

## 功能要求

1. 点击绿旗后，赛车回到起点，`distance` 设为 `0`。
2. 按下右方向键时，赛车向右移动，并让 `distance` 增加。
3. 当 `distance` 大于或等于 `100` 时，赛车说“到达终点”。

## 评分说明

系统会检查键盘事件、移动、判断和变量积木。""",
        "judge": task_config(
            "键盘赛车训练",
            [
                check("存在 Car 角色", 15, "sprite_exists", sprite="Car"),
                check("存在 distance 变量", 15, "variable_exists", variable="distance"),
                check("使用绿旗积木", 10, "block_exists", opcode="event_whenflagclicked"),
                check("使用按键事件积木", 20, "block_exists", opcode="event_whenkeypressed"),
                check("使用横向移动积木", 15, "block_exists_any", opcodes=["motion_changexby", "motion_gotoxy"]),
                check("使用如果判断积木", 15, "block_exists", opcode="control_if"),
                check("使用比较运算积木", 10, "block_exists_any", opcodes=["operator_gt", "operator_equals"]),
            ],
        ),
    },
    {
        "pid": "llscratcht05",
        "title": "画笔四宫格图案",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "画笔"],
        "statement": """# 画笔四宫格图案

请使用画笔扩展绘制一个四宫格图案。

## 准备工作

1. 添加或保留一个绘图角色，命名为 `Painter`。
2. 添加画笔扩展。
3. 新建变量 `side`，表示每个格子的边长。

## 功能要求

1. 点击绿旗后清空画面。
2. 设置 `side` 的值。
3. 使用画笔落笔、抬笔、定位和循环积木绘制 4 个正方形格子。
4. 每个格子可以使用不同颜色。

## 评分说明

系统会检查画笔扩展、循环和移动相关积木。""",
        "judge": task_config(
            "画笔四宫格图案",
            [
                check("存在 Painter 角色", 15, "sprite_exists", sprite="Painter"),
                check("存在 side 变量", 10, "variable_exists", variable="side"),
                check("使用绿旗积木", 10, "block_exists", opcode="event_whenflagclicked"),
                check("使用清空画笔积木", 15, "block_exists", opcode="pen_clear"),
                check("使用落笔积木", 15, "block_exists", opcode="pen_penDown"),
                check("使用移动步数积木", 15, "block_exists", opcode="motion_movesteps"),
                check("使用右转积木", 10, "block_exists_any", opcodes=["motion_turnright", "motion_turnleft"]),
                check("使用重复执行积木", 10, "block_exists", opcode="control_repeat"),
            ],
        ),
    },
    {
        "pid": "llscratcht06",
        "title": "克隆星星雨",
        "kind_label": "任务题",
        "problem_kind": "task",
        "judge_mode": "hybrid",
        "tags": ["Scratch", "任务题", "克隆"],
        "statement": """# 克隆星星雨

请制作一个星星不断落下的小游戏雏形。

## 准备工作

1. 添加星星角色，命名为 `Star`。
2. 新建变量 `caught`。

## 功能要求

1. 点击绿旗后，`caught` 设为 `0`。
2. 程序不断创建 `Star` 的克隆体。
3. 每个克隆体从舞台上方出现并向下移动。
4. 克隆体到达底部或被接住后删除。

## 评分说明

系统会检查克隆、移动、条件判断和变量相关积木。""",
        "judge": task_config(
            "克隆星星雨",
            [
                check("存在 Star 角色", 20, "sprite_exists", sprite="Star"),
                check("存在 caught 变量", 15, "variable_exists", variable="caught"),
                check("使用绿旗积木", 10, "block_exists", opcode="event_whenflagclicked"),
                check("使用创建克隆体积木", 20, "block_exists", opcode="control_create_clone_of"),
                check("使用当作为克隆体启动积木", 15, "block_exists", opcode="control_start_as_clone"),
                check("使用删除克隆体积木", 10, "block_exists", opcode="control_delete_this_clone"),
                check("使用条件判断积木", 10, "block_exists", opcode="control_if"),
            ],
        ),
    },
    {
        "pid": "llscratcha01",
        "title": "考试日期格式转换器",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "问答输入"],
        "statement": """# 考试日期格式转换器

后台传来的考试日期是一串 8 位数字，例如 `20260615`。请把它转换成中文日期格式。

## 准备工作

1. 保留默认小猫角色和白色背景。
2. 新建变量 `标准日期`。

## 功能要求

1. 点击绿旗后，小猫询问：`请输入8位数字的考试日期（例如20260615）：`
2. 前 4 位表示年份，第 5-6 位表示月份，第 7-8 位表示日期。
3. 使用连接积木生成 `YYYY年MM月DD日`，并存入变量 `标准日期`。
4. 最后小猫说出：`转换完成！考试日期是：YYYY年MM月DD日`。

## 判题说明

本题使用“询问/回答输入 + 角色说话输出”进行自动测评。""",
        "judge": algorithm_config(
            "考试日期格式转换器",
            {
                "inputMode": "ask",
                "outputMode": "say",
                "cases": [
                    {"name": "样例 1", "input": "20260615", "expectedOutput": "转换完成！考试日期是：2026年06月15日", "score": 20},
                    {"name": "样例 2", "input": "20261111", "expectedOutput": "转换完成！考试日期是：2026年11月11日", "score": 20},
                    {"name": "月初日期", "input": "20270102", "expectedOutput": "转换完成！考试日期是：2027年01月02日", "score": 20},
                    {"name": "年末日期", "input": "20281231", "expectedOutput": "转换完成！考试日期是：2028年12月31日", "score": 20, "hidden": True},
                    {"name": "隐藏日期", "input": "20300509", "expectedOutput": "转换完成！考试日期是：2030年05月09日", "score": 20, "hidden": True},
                ],
            },
        ),
    },
    {
        "pid": "llscratcha02",
        "title": "两位数 3 的倍数判定",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "问答输入"],
        "statement": """# 两位数 3 的倍数判定

请判断一个两位数是否是 3 的倍数。

## 准备工作

1. 保留默认小猫角色。
2. 添加背景 `Room 1`。

## 功能要求

1. 点击绿旗后，小猫询问：`请输入10-99之间的数字`
2. 如果输入不是 10 到 99 之间的数字，需要继续询问，直到输入合法两位数。
3. 合法输入后，计算十位和个位数字之和。
4. 如果数字之和能被 3 整除，说 `是3的倍数`；否则说 `不是3的倍数`。

## 判题说明

本题会测试合法输入，也会测试先输入错误值再输入合法值的情况。""",
        "judge": algorithm_config(
            "两位数 3 的倍数判定",
            {
                "inputMode": "ask",
                "outputMode": "say",
                "cases": [
                    {"name": "45 是 3 的倍数", "input": "45", "expectedOutput": "是3的倍数", "score": 20},
                    {"name": "47 不是 3 的倍数", "input": "47", "expectedOutput": "不是3的倍数", "score": 20},
                    {"name": "99 是 3 的倍数", "input": "99", "expectedOutput": "是3的倍数", "score": 20},
                    {"name": "隐藏边界 30", "input": "30", "expectedOutput": "是3的倍数", "score": 20, "hidden": True},
                    {"name": "隐藏边界 58", "input": "58", "expectedOutput": "不是3的倍数", "score": 20, "hidden": True},
                ],
            },
        ),
    },
    {
        "pid": "llscratcha03",
        "title": "藏头诗提取器",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "列表"],
        "statement": """# 藏头诗提取器

请从四句诗中依次取出第一个字，并组合成藏头内容。

## 准备工作

1. 保留默认小猫角色和白色背景。
2. 新建变量 `藏头`。
3. 新建列表 `江雪`。

## 功能要求

1. 点击绿旗后清空列表 `江雪`。
2. 依次加入四项：`千山鸟飞绝，`、`万径人踪灭。`、`孤舟蓑笠翁，`、`独钓寒江雪。`
3. 使用循环和变量依次截取每句诗的第一个字。
4. 把结果存入变量 `藏头`。

## 输出要求

变量 `藏头` 的最终值应为 `千万孤独`，无需使用说话积木。""",
        "judge": algorithm_config(
            "藏头诗提取器",
            {
                "inputMode": "variable",
                "inputVariable": "input",
                "outputMode": "variable",
                "outputVariable": "藏头",
                "cases": [
                    {"name": "固定古诗提取", "input": "", "expectedOutput": "千万孤独", "score": 100},
                ],
            },
        ),
    },
    {
        "pid": "llscratcha04",
        "title": "大苹果统计器",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "列表输入"],
        "statement": """# 大苹果统计器

果园需要统计重量大于 300 克的大苹果数量和总重量。

## 准备工作

1. 删除默认小猫，添加角色 `Apple`。
2. 新建列表 `苹果重量`。
3. 新建变量 `result`。

## 功能要求

1. 系统会把测试数据直接写入列表 `苹果重量`。
2. 程序需要遍历列表，找出重量大于 300 的苹果。
3. 把数量和总重量写入变量 `result`，格式为：`数量#总重量`。

## 输出样例

如果列表是 `[150, 320, 450, 260, 310]`，`result` 应为 `3#1080`。""",
        "judge": algorithm_config(
            "大苹果统计器",
            {
                "inputMode": "list",
                "inputList": "苹果重量",
                "outputMode": "variable",
                "outputVariable": "result",
                "cases": [
                    {"name": "样例 1", "input": [150, 320, 450, 260, 310], "expectedOutput": "3#1080", "score": 20},
                    {"name": "边界 300 不计入", "input": [300, 301, 299, 500], "expectedOutput": "2#801", "score": 20},
                    {"name": "全部都是大苹果", "input": [350, 360, 370], "expectedOutput": "3#1080", "score": 20},
                    {"name": "没有大苹果", "input": [100, 200, 300], "expectedOutput": "0#0", "score": 20, "hidden": True},
                    {"name": "隐藏混合数据", "input": [420, 180, 305, 600, 299, 301], "expectedOutput": "4#1626", "score": 20, "hidden": True},
                ],
            },
        ),
    },
    {
        "pid": "llscratcha05",
        "title": "成绩等级播报器",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "条件判断"],
        "statement": """# 成绩等级播报器

请根据输入分数输出等级。

## 功能要求

1. 点击绿旗后询问：`请输入成绩`
2. 90 分及以上说 `优秀`。
3. 80 到 89 分说 `良好`。
4. 60 到 79 分说 `合格`。
5. 60 分以下说 `继续努力`。

## 判题说明

本题使用询问输入和说话输出进行自动测评。""",
        "judge": algorithm_config(
            "成绩等级播报器",
            {
                "inputMode": "ask",
                "outputMode": "say",
                "cases": [
                    {"name": "优秀", "input": "95", "expectedOutput": "优秀", "score": 20},
                    {"name": "良好边界", "input": "89", "expectedOutput": "良好", "score": 20},
                    {"name": "合格边界", "input": "60", "expectedOutput": "合格", "score": 20},
                    {"name": "不合格", "input": "42", "expectedOutput": "继续努力", "score": 20, "hidden": True},
                    {"name": "优秀边界", "input": "90", "expectedOutput": "优秀", "score": 20, "hidden": True},
                ],
            },
        ),
    },
    {
        "pid": "llscratcha06",
        "title": "列表筛选与重排",
        "kind_label": "算法题",
        "problem_kind": "algorithm",
        "judge_mode": "dynamic",
        "tags": ["Scratch", "算法题", "列表输出"],
        "statement": """# 列表筛选与重排

请根据规则处理列表，并把结果写入变量 `result`。

## 输入说明

系统会把测试数据直接写入列表 `list`。

## 输出说明

新建变量 `result`，用于存储排序后的结果，中间用 `#` 连接。

## 处理规则

1. 从列表 `list` 中找出“能被 3 整除但不能被 5 整除”的数。
2. 这些数按从小到大的顺序放在结果前面。
3. 其他数按原来出现顺序的反向顺序放在后面。
4. 最终把所有数字用 `#` 连接，存入变量 `result`。

## 样例

输入：`[13, 15, 7, 12, 9, 17, 21, 5, 4, 19]`

输出：`9#12#21#19#4#5#17#7#15#13`

注意：只需要把结果写入变量 `result`，无需使用说话积木。""",
        "judge": algorithm_config(
            "列表筛选与重排",
            {
                "inputMode": "list",
                "inputList": "list",
                "outputMode": "variable",
                "outputVariable": "result",
                "cases": [
                    {
                        "name": "样例 1",
                        "input": [13, 15, 7, 12, 9, 17, 21, 5, 4, 19],
                        "expectedOutput": "9#12#21#19#4#5#17#7#15#13",
                        "score": 20,
                    },
                    {
                        "name": "样例 2",
                        "input": [5, 10, 48, 81, 50, 20, 85, 90, 60, 30],
                        "expectedOutput": "48#81#30#60#90#85#20#50#10#5",
                        "score": 20,
                    },
                    {
                        "name": "全部进入前半部分",
                        "input": [3, 6, 9, 12],
                        "expectedOutput": "3#6#9#12",
                        "score": 20,
                    },
                    {
                        "name": "全部进入后半部分",
                        "input": [5, 10, 15, 20],
                        "expectedOutput": "20#15#10#5",
                        "score": 20,
                        "hidden": True,
                    },
                    {
                        "name": "隐藏混合数据",
                        "input": [30, 27, 18, 14, 45, 33],
                        "expectedOutput": "18#27#33#45#14#30",
                        "score": 20,
                        "hidden": True,
                    },
                ],
            },
        ),
    },
]


def yaml_manifest(problem: dict[str, Any]) -> str:
    tags = ["Scratch", *[tag for tag in problem["tags"] if tag != "Scratch"]]
    tag_lines = "\n".join(f"  - {q(tag)}" for tag in dict.fromkeys(tags))
    disabled = "\n".join("    - videoSensing".splitlines())
    return f"""format: hydro-scratch-problem
version: 1
pid: {problem["pid"]}
title: {q(problem["title"])}
hidden: false
tags:
{tag_lines}
scratch:
  enabled: true
  problemKind: {problem["problem_kind"]}
  submitMode: both
  judgeMode: {problem["judge_mode"]}
  maxScore: 100
  allowDownloadTemplate: true
  disabledScratchExtensions:
{disabled}
  limits:
    maxProjectSizeMB: {LIMITS["maxProjectSizeMB"]}
    maxUnpackedSizeMB: {LIMITS["maxUnpackedSizeMB"]}
    maxAssetSizeMB: {LIMITS["maxAssetSizeMB"]}
    maxAssetCount: {LIMITS["maxAssetCount"]}
    maxProjectJsonSizeMB: {LIMITS["maxProjectJsonSizeMB"]}
"""


def write_problem(problem: dict[str, Any]) -> dict[str, str]:
    folder = OUT / problem["pid"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "problem.yaml").write_text(yaml_manifest(problem), encoding="utf-8")
    (folder / "statement.md").write_text(problem["statement"].strip() + "\n", encoding="utf-8")
    (folder / "scratch-judge.json").write_text(
        json.dumps(problem["judge"], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    zip_path = OUT / f'{problem["pid"]}.scratch-problem.zip'
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(folder / "problem.yaml", "problem.yaml")
        zf.write(folder / "statement.md", "statement.md")
        zf.write(folder / "scratch-judge.json", "scratch-judge.json")
    return {
        "pid": problem["pid"],
        "title": problem["title"],
        "kind": problem["kind_label"],
        "zip": str(zip_path.relative_to(ROOT)),
    }


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    manifest = [write_problem(problem) for problem in PROBLEMS]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        "# 参考题型改写 Scratch 题包\n\n"
        "本目录包含 12 道重新设计的 Scratch 题包：6 道任务题、6 道算法题。题型参考公开题库页面的常见编程考点，题面、测试点和变量命名均已重新整理。\n\n"
        + "\n".join(f"- `{item['pid']}` {item['kind']}：{item['title']}" for item in manifest)
        + "\n\n导入方式：进入 Hydro scratch 域题目导入页，逐个上传 `*.scratch-problem.zip` 文件即可。\n",
        encoding="utf-8",
    )

    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
