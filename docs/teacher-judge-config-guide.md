# Scratch 自动测评题目配置模板说明

本文档面向出题老师，说明如何在 Scratch 题目的 `Auto Judge Config` 中配置测试点。

适用版本：`hydro-plugin-scratch 0.4.0+`

> 0.6.14 起，算法题支持三种输入方式和三种输出方式：询问回答、变量、列表。老师可以在创建页、编辑页或配置页直接选择，不必手写 JSON。

## 1. 配置入口

进入 Scratch 题目的配置页：

```text
/scratch/problem/:pid/config
```

## 1.1 题目类型：任务题与算法题

从 0.6.11 开始，Scratch 题目增加 `题目类型`：

| 题目类型 | 配置入口 | 判题方式 | 适用场景 |
| --- | --- | --- | --- |
| `task` | `staticChecks` / `structureChecks` / `dynamicChecks` | 按任务点得分，和原来一致 | Scratch 教学任务、角色位置、积木顺序、变量结果检查 |
| `algorithm` | `algorithm.cases` | 多组输入输出用例批量测试 | 类似传统 OJ 的算法题、计算题、字符串处理题 |

老题目没有 `problemKind` 字段时，会自动按 `task` 处理，不影响已有题目。

### 1.1.1 算法题学生约定

算法题默认约定：

- 输入放在 Scratch 变量 `input` 中。
- 学生点击绿旗后读取 `input`，计算答案。
- 输出写入 Scratch 变量 `output` 中。
- 系统等待 `waitMs` 毫秒后读取 `output` 并与期望输出比较。

如果希望使用列表输入，可以在配置中写：

```json
{
  "algorithm": {
    "inputList": "input",
    "inputSplit": "lines",
    "outputVariable": "output"
  }
}
```

`inputSplit` 可选：

| 值 | 说明 |
| --- | --- |
| `lines` | 按行拆分输入，默认值 |
| `tokens` | 按空白字符拆分输入 |
| `none` | 不拆分，整个输入作为列表第 1 项 |

### 1.1.2 算法题快速录入格式

0.6.12 起，算法题不必优先手写 JSON。进入 Scratch 题目设置页，把题目类型设为 `算法题：批量输入输出测试` 并保存后，可以直接在“算法题测试点快速录入”中填写：

```text
输入 => 期望输出 => 分值 => 测试点名称
```

示例：

```text
21 => 42 => 25 => 样例 1
3\n1 2 3 => 6 => 25 => 样例 2
* 5\n10 20 30 40 50 => 150 => 50 => 隐藏测试
```

说明：

- 每行一个测试点。
- 多行输入请写成 `\n`。
- 行首加 `*` 表示隐藏测试点，学生报告中不会显示实际输出和期望输出。
- 输出比较方式建议默认使用“忽略首尾空白”；传统 OJ 风格的多空格、多换行输出可选“按空白分词比较”。
- 若需要列表输入、数字误差、复杂动态操作，仍然可以展开“高级自动测评 JSON 配置”进行细调。

快速录入保存后，会自动生成等价的 `algorithm.cases` 配置。

### 1.1.2.1 算法题输入输出方式（0.6.14+）

算法题现在可以在页面上选择“输入方式”和“输出方式”。

| 场景 | 输入方式 | 输出方式 | 学生作品要求 |
| --- | --- | --- | --- |
| 问答式 Scratch 题 | 询问回答输入 | 角色说出结果 | 使用“询问并等待”，从“回答”积木取值，最后用“说”输出答案 |
| 传统变量题 | 变量输入 | 变量输出 | 从指定输入变量读取，运行后把答案写入指定输出变量 |
| 列表批量题 | 列表输入 | 变量输出或列表输出 | 判题器把测试数据写入指定列表，学生处理后写入变量或列表 |

常用配置：

```json
{
  "algorithm": {
    "inputMode": "ask",
    "outputMode": "say",
    "compareMode": "exact"
  }
}
```

上面适合“日期转换”“判断 3 的倍数”等题。测试点示例：

```text
20260615 => 转换完成！考试日期是：2026年06月15日 => 25 => 日期转换
45 => 是3的倍数 => 25 => 两位数判断
* 47 => 不是3的倍数 => 25 => 隐藏样例
```

排序、筛选、列表处理题建议使用列表输入和变量输出：

```json
{
  "algorithm": {
    "inputMode": "list",
    "inputList": "list",
    "outputMode": "variable",
    "outputVariable": "result",
    "compareMode": "exact"
  }
}
```

测试点示例：

```text
[13,15,7,12,9,17,21,5,4,19] => 9#12#21#19#4#5#17#7#15#13 => 50 => 排序样例 1
[5,10,48,81,50,20,85,90,60,30] => 48#81#30#60#90#85#20#50#10#5 => 50 => 排序样例 2
```

注意：

- `inputMode: "ask"` 时，测试点输入如果写成数组，例如 `["5","45"]`，判题器会按顺序回答多次询问，适合“输入不合法就重复询问”的题。
- `inputMode: "list"` 时，测试点输入建议写成 JSON 数组，例如 `[13,15,7]`，判题器会直接写入 Scratch 列表。
- `outputMode: "say"` 会读取角色最后一次非空“说”内容。若题目要求不要使用“说”，请选择变量输出或列表输出。
- `outputMode: "variable"` 时变量名必须和配置完全一致，例如 `result`，大小写也要一致。

### 1.1.3 算法题配置模板

创建题目时把 `题目类型` 设置为 `算法题：批量输入输出测试`，`Judge Mode` 建议设置为 `Dynamic` 或 `Hybrid`，然后在 `Auto Judge Config` 中填写：

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "algorithm": {
    "target": "Stage",
    "inputVariable": "input",
    "outputVariable": "output",
    "compareMode": "trim",
    "waitMs": 1000,
    "timeoutMs": 6000,
    "cases": [
      {
        "name": "样例 1",
        "input": "21",
        "expectedOutput": "42",
        "score": 25,
        "hint": "请从 input 变量读取输入，并把答案写入 output 变量。"
      },
      {
        "name": "样例 2",
        "input": "3\n1 2 3",
        "expectedOutput": "6",
        "score": 25
      },
      {
        "name": "隐藏测试 1",
        "input": "5\n10 20 30 40 50",
        "expectedOutput": "150",
        "score": 25,
        "hidden": true
      },
      {
        "name": "隐藏测试 2",
        "input": "0",
        "expectedOutput": "0",
        "score": 25,
        "hidden": true
      }
    ]
  }
}
```

同样的模板文件也放在：

```text
docs/templates/judge-config-algorithm-io.json
docs/templates/judge-config-algorithm-list-result.json
```

### 1.1.4 算法题字段说明

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `algorithm.target` | string | 不限制角色 | 指定从哪个角色或舞台读写变量，可写 `Stage` |
| `algorithm.inputVariable` | string | `input` | 输入变量名 |
| `algorithm.inputList` | string | `input` | 输入列表名，存在时会同步写入 |
| `algorithm.outputVariable` | string | `output` | 输出变量名 |
| `algorithm.outputList` | string | `output` | 输出列表名，变量不存在时读取列表 |
| `algorithm.compareMode` | string | `trim` | 默认比较方式 |
| `algorithm.numericTolerance` | number | `1e-9` | 数字比较允许误差 |
| `algorithm.waitMs` | number | `1000` | 点击绿旗后等待多久读取输出 |
| `algorithm.timeoutMs` | number | `max(5000, waitMs + 2000)` | 单个测试点超时时间 |
| `algorithm.cases` | array | `[]` | 测试用例列表 |

`compareMode` 可选：

| 值 | 说明 |
| --- | --- |
| `exact` | 完全一致，保留首尾空白 |
| `trim` | 忽略首尾空白，推荐默认 |
| `tokens` | 按空白字符切分后比较，适合多空格/多换行输出 |
| `number` | 按数字比较，使用 `numericTolerance` |

### 1.1.5 注意事项

- 算法题只根据 `algorithm.cases` 判题，不会执行任务题的 `staticChecks` / `structureChecks` / `dynamicChecks`。
- 任务题仍然只根据原任务点判题，不会执行 `algorithm.cases`。
- 算法题必须把 `Judge Mode` 设置为 `Dynamic` 或 `Hybrid`；`Manual` 不自动判题，`Static` 不运行 Scratch VM。
- 隐藏测试点设置 `hidden: true` 后，学生报告中不会展示实际输出和期望输出。
- Scratch 没有原生 stdin/stdout，所以本插件用变量或列表模拟输入输出。题面必须明确要求学生保留并使用 `input` / `output`。

找到：

```text
Auto Judge Config
```

将本文档中的 JSON 配置粘贴进去，然后把 `Judge Mode` 设置为合适模式。

## 2. 判题模式

| Judge Mode | 会运行哪些测试点 | 适用场景 |
| --- | --- | --- |
| `Manual` | 不自动判题 | 老师完全人工评分 |
| `Static` | `staticChecks` + `structureChecks` | 只检查作品结构，不运行作品 |
| `Dynamic` | `dynamicChecks` | 只运行作品并检查结果 |
| `Hybrid` | 三类测试点全部运行 | 推荐模式，同时检查结构和运行结果 |

推荐日常教学使用 `Hybrid`。

## 3. 配置文件总模板

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [],
  "structureChecks": [],
  "dynamicChecks": [],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "defaultWaitMs": 800,
    "keyPressMs": 100,
    "positionTolerance": 5
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | number | 否 | 推荐写 `2`，表示使用新版结构/动态判题配置 |
| `totalScore` | number | 是 | 本题自动测评总分 |
| `staticChecks` | array | 否 | 基础存在性测试点 |
| `structureChecks` | array | 否 | 限定角色、脚本顺序、积木参数的测试点 |
| `dynamicChecks` | array | 否 | 运行 Scratch 项目后的结果测试点 |
| `dynamicOptions` | object | 否 | 动态判题默认参数 |

## 4. 分数设计建议

建议不要把分数全部放在动态结果上。更稳的分配方式：

```text
基础存在性：10%-20%
结构顺序：30%-40%
动态结果：40%-60%
```

示例：

```text
存在 Player 角色：10 分
Player 有绿旗脚本：10 分
Player 绿旗脚本顺序正确：20 分
运行后 Player 到达目标位置：60 分
```

这样可以避免两种问题：

- 学生只堆积木但没有做对逻辑。
- 学生碰巧运行结果对了，但没有按本节课要求使用指定模块。

## 5. staticChecks：基础存在性测试点

`staticChecks` 不关心积木在哪个角色、哪个脚本里，只检查作品里是否存在指定内容。

### 5.1 检查角色存在：`sprite_exists`

```json
{
  "name": "存在 Player 角色",
  "type": "sprite_exists",
  "sprite": "Player",
  "score": 10,
  "hint": "请创建或重命名一个角色为 Player。"
}
```

通过条件：作品中存在名为 `Player` 的角色。

### 5.2 检查变量存在：`variable_exists`

```json
{
  "name": "存在 score 变量",
  "type": "variable_exists",
  "variable": "score",
  "score": 10,
  "hint": "请创建变量 score。"
}
```

通过条件：作品中存在名为 `score` 的变量。

### 5.3 检查列表存在：`list_exists`

```json
{
  "name": "存在 ranking 列表",
  "type": "list_exists",
  "list": "ranking",
  "score": 10,
  "hint": "请创建列表 ranking。"
}
```

通过条件：作品中存在名为 `ranking` 的列表。

### 5.4 检查广播存在：`broadcast_exists`

```json
{
  "name": "存在 gameStart 广播",
  "type": "broadcast_exists",
  "broadcast": "gameStart",
  "score": 10,
  "hint": "请创建或使用 gameStart 广播。"
}
```

通过条件：作品中存在名为 `gameStart` 的广播消息。

### 5.5 检查指定积木存在：`block_exists`

```json
{
  "name": "使用绿旗事件",
  "type": "block_exists",
  "opcode": "event_whenflagclicked",
  "score": 10,
  "hint": "请使用“当绿旗被点击”积木。"
}
```

通过条件：作品中任意位置存在指定 opcode。

常用 opcode：

| Scratch 积木 | opcode |
| --- | --- |
| 当绿旗被点击 | `event_whenflagclicked` |
| 当按下按键 | `event_whenkeypressed` |
| 移动若干步 | `motion_movesteps` |
| 将 x 坐标增加 | `motion_changexby` |
| 移到 x/y | `motion_gotoxy` |
| 将变量设为 | `data_setvariableto` |
| 将变量增加 | `data_changevariableby` |
| 重复执行 | `control_repeat` |
| 重复执行直到 | `control_repeat_until` |
| 如果那么 | `control_if` |
| 如果那么否则 | `control_if_else` |

### 5.6 检查任意一个积木存在：`block_exists_any`

```json
{
  "name": "使用移动类积木",
  "type": "block_exists_any",
  "opcodes": [
    "motion_movesteps",
    "motion_changexby",
    "motion_changeyby"
  ],
  "score": 10,
  "hint": "请至少使用一种移动类积木。"
}
```

通过条件：`opcodes` 中任意一个积木存在。

### 5.7 检查禁用积木没有出现：`forbidden_block_absent`

```json
{
  "name": "不能直接跳到答案位置",
  "type": "forbidden_block_absent",
  "opcode": "motion_gotoxy",
  "score": 10,
  "hint": "本题要求使用移动积木完成，不要直接使用移到 x/y。"
}
```

通过条件：作品中没有出现指定 opcode。

### 5.8 检查某类积木数量：`min_block_count`

```json
{
  "name": "至少使用两个判断",
  "type": "min_block_count",
  "opcode": "control_if",
  "count": 2,
  "score": 10,
  "hint": "请至少使用两个“如果那么”积木。"
}
```

通过条件：指定 opcode 出现次数大于等于 `count`。

## 6. structureChecks：角色与脚本结构测试点

`structureChecks` 用于解决“积木存在但不在正确角色/正确脚本里”的问题。

### 6.1 指定角色存在指定入口脚本：`target_script_exists`

```json
{
  "name": "Player 有绿旗脚本",
  "type": "target_script_exists",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "score": 10,
  "hint": "请在 Player 角色中添加“当绿旗被点击”脚本。"
}
```

通过条件：

- 存在 `Player` 角色。
- `Player` 角色中存在以 `event_whenflagclicked` 开头的脚本。

注意：如果绿旗脚本在其他角色中，不通过。

### 6.2 检查脚本中的积木顺序：`script_sequence`

```json
{
  "name": "Player 先定位再移动",
  "type": "script_sequence",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "sequence": [
    "event_whenflagclicked",
    "motion_gotoxy",
    "motion_movesteps"
  ],
  "mode": "ordered_subsequence",
  "score": 20,
  "hint": "请在 Player 的绿旗脚本中先设置位置，再移动。"
}
```

通过条件：

- 在 `Player` 的绿旗脚本中，按顺序出现 `sequence` 里的 opcode。
- `ordered_subsequence` 允许中间插入其他积木，比如“说话”“等待”。

`mode` 可选值：

| mode | 含义 |
| --- | --- |
| `ordered_subsequence` | 只要求关键积木顺序正确，中间可以有其他积木，推荐使用 |
| `exact_prefix` | 要求脚本开头严格匹配该顺序 |

### 6.3 检查同一脚本模块是否完整：`script_module`

```json
{
  "name": "Player 移动计分模块完整",
  "type": "script_module",
  "target": "Player",
  "hat": "event_whenkeypressed",
  "requiredOpcodes": [
    "motion_changexby",
    "data_changevariableby"
  ],
  "ordered": true,
  "score": 20,
  "hint": "请把移动和计分放在 Player 的同一条按键脚本中。"
}
```

通过条件：

- 关键积木必须出现在同一条脚本链中。
- `ordered: true` 时，还要求顺序与 `requiredOpcodes` 一致。

适合检查：

- 按键移动后计数。
- 碰到物体后加分。
- 初始化后广播。

### 6.4 检查积木输入参数：`block_input_equals`

```json
{
  "name": "Player 初始坐标正确",
  "type": "block_input_equals",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "opcode": "motion_gotoxy",
  "inputs": {
    "X": -150,
    "Y": 0
  },
  "score": 15,
  "hint": "请先把 Player 移到 x=-150, y=0。"
}
```

通过条件：

- 在指定角色和入口脚本中找到 `motion_gotoxy`。
- 该积木的输入参数 `X` 和 `Y` 与配置一致。

常见输入名：

| 积木 | opcode | 常用 inputs |
| --- | --- | --- |
| 移到 x/y | `motion_gotoxy` | `X`, `Y` |
| 移动若干步 | `motion_movesteps` | `STEPS` |
| 将 x 坐标增加 | `motion_changexby` | `DX` |
| 将 y 坐标增加 | `motion_changeyby` | `DY` |
| 将变量设为 | `data_setvariableto` | `VALUE` |
| 将变量增加 | `data_changevariableby` | `VALUE` |

### 6.5 检查积木字段参数：`block_field_equals`

```json
{
  "name": "使用右方向键触发",
  "type": "block_field_equals",
  "target": "Player",
  "opcode": "event_whenkeypressed",
  "fields": {
    "KEY_OPTION": "right arrow"
  },
  "score": 10,
  "hint": "请使用“当按下右方向键”事件。"
}
```

通过条件：

- 找到指定 opcode。
- 指定 field 与配置一致。

常见字段名：

| 积木 | opcode | 常用 fields |
| --- | --- | --- |
| 当按下按键 | `event_whenkeypressed` | `KEY_OPTION` |
| 将变量设为 | `data_setvariableto` | `VARIABLE` |
| 将变量增加 | `data_changevariableby` | `VARIABLE` |
| 当接收到广播 | `event_whenbroadcastreceived` | `BROADCAST_OPTION` |

## 7. dynamicChecks：运行结果测试点

`dynamicChecks` 会加载 Scratch VM，实际运行学生作品，然后读取变量或角色状态。

### 7.1 检查项目能运行：`runtime_runs`

```json
{
  "name": "绿旗脚本可以运行",
  "type": "runtime_runs",
  "score": 10,
  "steps": [
    { "action": "green_flag" },
    { "action": "wait", "ms": 500 }
  ],
  "hint": "请确认点击绿旗后项目不会报错。"
}
```

通过条件：项目可以加载并执行 steps，没有超时或运行错误。

### 7.2 检查变量值：`variable_value`

```json
{
  "name": "绿旗后 score 等于 10",
  "type": "variable_value",
  "variable": "score",
  "expected": 10,
  "operator": "equals",
  "score": 30,
  "steps": [
    { "action": "green_flag" },
    { "action": "wait", "ms": 500 }
  ],
  "hint": "点击绿旗后，请把 score 设置为 10。"
}
```

支持的 `operator`：

| operator | 含义 |
| --- | --- |
| `exists` | 变量存在即可 |
| `equals` | 等于 expected |
| `not_equals` | 不等于 expected |
| `greater_than` | 大于 expected |
| `greater_or_equal` | 大于等于 expected |
| `less_than` | 小于 expected |
| `less_or_equal` | 小于等于 expected |
| `changed` | 运行后值与运行前不同 |

### 7.3 检查角色最终位置：`sprite_position`

```json
{
  "name": "Player 到达目标位置",
  "type": "sprite_position",
  "target": "Player",
  "expected": {
    "x": 100,
    "y": 0
  },
  "tolerance": 5,
  "score": 40,
  "steps": [
    { "action": "green_flag" },
    { "action": "wait", "ms": 800 }
  ],
  "hint": "运行后 Player 应移动到 x=100, y=0 附近。"
}
```

通过条件：

```text
abs(actual.x - expected.x) <= tolerance
abs(actual.y - expected.y) <= tolerance
```

说明：

- 可以只检查 x，例如 `"expected": { "x": 100 }`。
- 可以只检查 y，例如 `"expected": { "y": 0 }`。
- 建议设置 `tolerance` 为 `3` 到 `10`，避免 Scratch 调度和浮点差异造成误判。

## 8. dynamic steps：动态运行步骤

动态测试点中的 `steps` 描述系统如何操作学生作品。

| action | 示例 | 说明 |
| --- | --- | --- |
| `green_flag` | `{ "action": "green_flag" }` | 点击绿旗 |
| `wait` | `{ "action": "wait", "ms": 500 }` | 等待指定毫秒 |
| `key_press` | `{ "action": "key_press", "key": "space", "ms": 100 }` | 按下再松开按键 |
| `key_down` | `{ "action": "key_down", "key": "right arrow" }` | 按下按键 |
| `key_up` | `{ "action": "key_up", "key": "right arrow" }` | 松开按键 |

常用 key：

```text
space
left arrow
right arrow
up arrow
down arrow
enter
a
b
c
```

## 9. 完整案例一：绿旗后角色移动到目标位置

教学目标：

- 学生创建 `Player` 角色。
- 点击绿旗后，角色先到 `x=-150, y=0`。
- 然后移动到 `x=100, y=0` 附近。

推荐 `Judge Mode`：`Hybrid`

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10,
      "hint": "请创建或重命名一个角色为 Player。"
    }
  ],
  "structureChecks": [
    {
      "name": "Player 有绿旗脚本",
      "type": "target_script_exists",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "score": 10,
      "hint": "请在 Player 角色中添加绿旗脚本。"
    },
    {
      "name": "Player 先定位再移动",
      "type": "script_sequence",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "sequence": [
        "event_whenflagclicked",
        "motion_gotoxy",
        "motion_movesteps"
      ],
      "mode": "ordered_subsequence",
      "score": 20,
      "hint": "请先设置位置，再使用移动积木。"
    },
    {
      "name": "Player 初始坐标正确",
      "type": "block_input_equals",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "opcode": "motion_gotoxy",
      "inputs": {
        "X": -150,
        "Y": 0
      },
      "score": 20,
      "hint": "请把初始位置设为 x=-150, y=0。"
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player 最终到达 x=100 y=0",
      "type": "sprite_position",
      "target": "Player",
      "expected": {
        "x": 100,
        "y": 0
      },
      "tolerance": 5,
      "score": 40,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 1000 }
      ],
      "hint": "运行后 Player 应到达 x=100, y=0 附近。"
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "positionTolerance": 5
  }
}
```

## 10. 完整案例二：按右方向键移动并计数

教学目标：

- 创建 `Player` 角色。
- 创建 `steps` 变量。
- 绿旗后 `steps = 0`。
- 按两次右方向键后，角色向右移动，`steps >= 2`。

推荐 `Judge Mode`：`Hybrid`

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10
    },
    {
      "name": "存在 steps 变量",
      "type": "variable_exists",
      "variable": "steps",
      "score": 10
    }
  ],
  "structureChecks": [
    {
      "name": "Player 使用右方向键事件",
      "type": "block_field_equals",
      "target": "Player",
      "opcode": "event_whenkeypressed",
      "fields": {
        "KEY_OPTION": "right arrow"
      },
      "score": 15,
      "hint": "请在 Player 角色中使用“当按下右方向键”。"
    },
    {
      "name": "按键脚本中包含移动和计数",
      "type": "script_module",
      "target": "Player",
      "hat": "event_whenkeypressed",
      "requiredOpcodes": [
        "motion_changexby",
        "data_changevariableby"
      ],
      "ordered": true,
      "score": 25,
      "hint": "请把向右移动和 steps 增加放在同一条按键脚本里。"
    }
  ],
  "dynamicChecks": [
    {
      "name": "绿旗后 steps 归零",
      "type": "variable_value",
      "variable": "steps",
      "expected": 0,
      "operator": "equals",
      "score": 15,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 300 }
      ],
      "hint": "请在绿旗脚本中把 steps 设置为 0。"
    },
    {
      "name": "按两次右方向键后 steps 至少为 2",
      "type": "variable_value",
      "variable": "steps",
      "expected": 2,
      "operator": "greater_or_equal",
      "score": 35,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 300 },
        { "action": "key_press", "key": "right arrow", "ms": 100 },
        { "action": "wait", "ms": 200 },
        { "action": "key_press", "key": "right arrow", "ms": 100 },
        { "action": "wait", "ms": 300 }
      ],
      "hint": "每按一次右方向键，steps 应增加 1。"
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 6000,
    "keyPressMs": 100
  }
}
```

## 11. 完整案例三：只做结构判题，不运行作品

适用于服务器暂时不想启用动态 VM，或只想检查学生是否按课程模块搭建脚本。

推荐 `Judge Mode`：`Static`

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 score 变量",
      "type": "variable_exists",
      "variable": "score",
      "score": 20
    }
  ],
  "structureChecks": [
    {
      "name": "绿旗脚本初始化 score",
      "type": "script_module",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "requiredOpcodes": [
        "event_whenflagclicked",
        "data_setvariableto"
      ],
      "ordered": true,
      "score": 40
    },
    {
      "name": "按空格键增加 score",
      "type": "script_module",
      "target": "Player",
      "hat": "event_whenkeypressed",
      "requiredOpcodes": [
        "event_whenkeypressed",
        "data_changevariableby"
      ],
      "ordered": true,
      "score": 40
    }
  ]
}
```

## 12. 老师配置时的常见错误

### 12.1 JSON 格式错误

错误示例：

```json
{
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10,
    }
  ]
}
```

问题：最后一个字段后多了逗号。

### 12.2 角色名和变量名大小写不一致

`Player`、`player`、`玩家` 是不同名称。配置里的名字必须和学生作品要求一致。

### 12.3 只写了 dynamicChecks，但 Judge Mode 仍是 Static

`Static` 模式不会运行 `dynamicChecks`。  
如果要检查运行后角色位置或变量值，请设置为 `Dynamic` 或 `Hybrid`。

### 12.4 位置判断没有容差

建议每个 `sprite_position` 都写：

```json
"tolerance": 5
```

### 12.5 顺序检查过于严格

初学者题目建议使用：

```json
"mode": "ordered_subsequence"
```

不要一开始就使用 `exact_prefix`，否则学生中间插入“等待”“说话”等积木也会被判错。

## 13. 推荐工作流程

1. 先写题目说明，明确角色名、变量名、运行结果。
2. 先配置 `staticChecks`，检查基础命名。
3. 再配置 `structureChecks`，限制角色、脚本入口和关键顺序。
4. 最后配置 `dynamicChecks`，验证运行结果。
5. 用一个正确样例和一个错误样例各提交一次。
6. 根据测试报告微调分值、等待时间和容差。

## 14. 最小可用模板

如果老师只想快速开始，可以先复制这个模板：

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10
    }
  ],
  "structureChecks": [
    {
      "name": "Player 有绿旗脚本",
      "type": "target_script_exists",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "score": 20
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player 到达目标位置",
      "type": "sprite_position",
      "target": "Player",
      "expected": {
        "x": 100,
        "y": 0
      },
      "tolerance": 5,
      "score": 70,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 800 }
      ]
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "positionTolerance": 5
  }
}
```
