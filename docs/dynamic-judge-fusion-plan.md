# Scratch 自动测评升级方案：模块顺序检测与动态角色结果判题

文档日期：2026-05-28  
当前插件目录：`E:\Users\moran\Documents\hydro_chajian`  
当前插件版本基线：`0.3.0`  
目标版本建议：`0.4.0`

## 1. 背景与目标

当前自动评分已经可以初步使用，主要能力是静态存在性检测：

- 是否存在指定角色
- 是否存在指定变量 / 列表 / 广播
- 是否存在指定积木 opcode
- 是否存在任意一个指定积木
- 是否未使用禁用积木
- 指定积木数量是否达到要求

这类规则适合作为入门自动判题，但会出现一个明显问题：学生只要把积木拖到作品里，就可能通过存在性检测，即使这些积木没有放在正确角色、正确事件、正确脚本顺序中，也没有产生题目要求的运行结果。

本次升级目标是把判题从“是否存在”推进到“是否按要求实现”：

1. 角色限定：要求某个角色自己实现指定模块，而不是任意角色里出现相关积木。
2. 顺序限定：要求脚本中的关键积木按照基本顺序出现。
3. 结果限定：运行项目后，检查角色位置、变量值等最终状态。
4. 混合判题：把静态结构检测和动态运行检测融合到同一份 `judgeConfig` 与同一份提交报告里。

本阶段只给执行方案，不直接改代码。

## 2. 当前能力确认

### 2.1 当前插件已经具备的接入点

当前插件已经完成以下基础链路：

- 题目配置保存 `judgeConfig`
- `.sb3` 上传和校验
- 提交后执行静态自动判题
- 判题结果写入 `ScratchSubmissionMeta.autoJudgeResult`
- 判题结果回写 Hydro Record
- 提交报告可以展示自动判题结果

当前核心代码位置：

- `src/static-judge.ts`
- `src/types.ts`
- `src/http.ts`
- `templates/scratch_problem_config.html`
- `templates/scratch_problem_edit.html`
- `templates/scratch_preview.html`
- `templates/scratch_score.html`

其中 `ScratchJudgeMode` 已经包含：

```ts
manual | static | dynamic | hybrid
```

`ScratchJudgeConfig` 也已经预留：

```ts
staticChecks?: ScratchStaticCheck[];
dynamicChecks?: unknown[];
dynamicOptions?: Record<string, unknown>;
```

因此本次升级不需要推倒重做，可以在现有插件内扩展。

### 2.2 OJ_text judge-worker 已有动态基础

`E:\moran_project\OJ_text\judge-worker` 里已有动态判题雏形：

- 可以加载 `.sb3`
- 可以通过 Scratch VM 执行项目
- 支持步骤：
  - `green_flag`
  - `wait`
  - `key_down`
  - `key_up`
  - `key_press`
- 支持动态检查：
  - `runtime_runs`
  - `variable_value`

但它目前还缺少本次最关键的两类能力：

- 角色脚本顺序 / 模块结构检测
- 角色运行后位置检测，例如 `Player.x = 100`、`Player.y = 0`

所以建议不是直接整体搬入，而是吸收其动态执行思路，在当前插件中建立更适合 Hydro 插件部署的判题核心。

## 3. 总体设计

建议把自动测评拆成三层：

```text
Scratch .sb3
  -> 读取 project.json
  -> 构建项目元信息 ProjectMeta
  -> 构建脚本图 ScriptGraph
  -> 执行静态 / 结构 / 动态判题
  -> 统一生成 ScratchJudgeResult
  -> 回写 Hydro Record
```

三类检测职责如下：

| 类型 | 是否运行 VM | 作用 | 示例 |
| --- | --- | --- | --- |
| `staticChecks` | 否 | 基础存在性检测 | 有 `Player` 角色、有 `score` 变量 |
| `structureChecks` | 否 | 判断指定角色、事件、脚本顺序和积木参数 | `Player` 的绿旗脚本中先 `go to x y` 再 `move steps` |
| `dynamicChecks` | 是 | 运行项目后读取最终状态 | 点击绿旗后 `Player.x` 接近 `100` |

推荐执行顺序：

```text
1. validateScratchProject
2. readProjectFromSb3
3. staticChecks
4. structureChecks
5. dynamicChecks
6. 汇总分数与状态
7. HydroApi.judge.end(...)
```

如果 `dynamicChecks` 配置为空，则只执行静态与结构判题。  
如果 VM 加载失败，只让动态测试点失败，不影响已经完成的静态 / 结构测试点结果。

## 4. 配置格式建议

建议把 `judgeConfig` 升级为 schema v2，但保持对当前 v1 配置兼容。

### 4.1 新版配置骨架

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [],
  "structureChecks": [],
  "dynamicChecks": [],
  "dynamicOptions": {
    "defaultWaitMs": 500,
    "timeoutMs": 5000,
    "positionTolerance": 3
  }
}
```

兼容策略：

- 没有 `schemaVersion` 的配置按当前 0.3.0 规则处理。
- 有 `staticChecks` 的旧配置继续有效。
- 新增 `structureChecks` 和更强的 `dynamicChecks`，不破坏旧题目。

### 4.2 结构检测：角色模块与顺序

建议新增 `structureChecks`，专门用于检查“某个角色是否按要求实现脚本模块”。

#### 检查类型一：指定角色中存在某个事件脚本

```json
{
  "name": "Player has green flag script",
  "type": "target_script_exists",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "score": 10,
  "hint": "请在 Player 角色中使用绿旗事件作为程序入口。"
}
```

判定逻辑：

- 只检查 `target = Player` 的 blocks。
- 只查找顶层 hat 积木。
- 找到 `event_whenflagclicked` 才通过。
- 其他角色中有绿旗事件不算通过。

#### 检查类型二：指定角色脚本包含有序积木

```json
{
  "name": "Player moves after green flag in correct order",
  "type": "script_sequence",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "sequence": [
    "event_whenflagclicked",
    "motion_gotoxy",
    "motion_movesteps"
  ],
  "mode": "ordered_subsequence",
  "score": 25,
  "hint": "请在 Player 的绿旗脚本中先设置位置，再移动。"
}
```

推荐支持两种 `mode`：

| mode | 含义 | 使用场景 |
| --- | --- | --- |
| `ordered_subsequence` | 关键积木按顺序出现，中间允许插入其他积木 | 教学判题更宽松 |
| `exact_prefix` | 脚本开头必须严格匹配给定顺序 | 模板化训练题 |

第一版建议优先实现 `ordered_subsequence`，因为更符合教学场景。

#### 检查类型三：指定积木参数值

只判断 opcode 顺序还不够，学生可能使用了 `motion_gotoxy`，但坐标不对。因此建议增加参数检查。

```json
{
  "name": "Player starts at x -150 y 0",
  "type": "block_input_equals",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "opcode": "motion_gotoxy",
  "inputs": {
    "X": -150,
    "Y": 0
  },
  "score": 15,
  "hint": "请先把 Player 移动到 x=-150, y=0。"
}
```

需要注意：Scratch 的 `inputs` 结构可能是嵌套数组或 shadow block，不能简单字符串匹配。实现时应写统一的 `resolveInputValue(block, inputName)`。

#### 检查类型四：限定模块必须在同一条脚本里

这是防止“积木都存在，但分散在不同脚本里”的关键。

```json
{
  "name": "Player green flag module is complete",
  "type": "script_module",
  "target": "Player",
  "hat": "event_whenflagclicked",
  "requiredOpcodes": [
    "motion_gotoxy",
    "motion_movesteps",
    "data_changevariableby"
  ],
  "ordered": true,
  "score": 30,
  "hint": "请把初始化、移动和计分放在 Player 的同一条绿旗脚本中。"
}
```

判定逻辑：

- 找到 `Player` 角色。
- 找到以 `event_whenflagclicked` 开头的脚本。
- 从 hat block 沿 `next` 指针展开。
- 检查所有 required opcodes 是否在同一条链路中出现。
- 如果 `ordered = true`，则按 `requiredOpcodes` 顺序匹配。

## 5. 动态检测：角色位置结果

### 5.1 新增动态检查类型

建议新增 `sprite_position`：

```json
{
  "name": "Player reaches target position after green flag",
  "type": "sprite_position",
  "target": "Player",
  "expected": {
    "x": 100,
    "y": 0
  },
  "tolerance": 5,
  "score": 30,
  "steps": [
    { "action": "green_flag" },
    { "action": "wait", "ms": 800 }
  ],
  "hint": "点击绿旗后，请让 Player 移动到 x=100, y=0 附近。"
}
```

判定逻辑：

- 启动 Scratch VM。
- 加载 `.sb3`。
- 执行 steps。
- 从 VM runtime 中找到 `Player` target。
- 读取最终 `x`、`y`。
- 使用容差比较：

```text
abs(actual.x - expected.x) <= tolerance
abs(actual.y - expected.y) <= tolerance
```

只配置 `x` 时只检查 x；只配置 `y` 时只检查 y。

### 5.2 建议同时支持的角色状态检查

角色位置是最急需的，但为了后续题型扩展，建议一次设计好接口。

| 检查类型 | 读取内容 | 示例 |
| --- | --- | --- |
| `sprite_position` | `x`, `y` | 角色最终移动到指定坐标 |
| `sprite_direction` | `direction` | 角色面向 90 度 |
| `sprite_visible` | `visible` | 点击绿旗后角色显示 |
| `sprite_costume` | 当前造型名称或编号 | 碰撞后切换造型 |
| `variable_value` | 变量值 | 分数等于 10 |
| `list_value` | 列表内容 | 排序结果 |

第一版建议只实现：

1. `runtime_runs`
2. `variable_value`
3. `sprite_position`

这样能覆盖绝大多数基础教学题。

### 5.3 动态步骤扩展

当前已有步骤：

```json
[
  { "action": "green_flag" },
  { "action": "wait", "ms": 500 },
  { "action": "key_press", "key": "right arrow", "ms": 100 }
]
```

建议第一版继续保持这几种即可：

- `green_flag`
- `wait`
- `key_down`
- `key_up`
- `key_press`

后续再加：

- `mouse_move`
- `mouse_down`
- `mouse_up`
- `broadcast`
- `stop_all`

不要第一版把鼠标、克隆、声音、画笔全部做进去，否则测试面会过大。

## 6. 判题结果结构调整

当前 `ScratchJudgeResult` 的 `mode` 是：

```ts
mode: 'static'
```

升级后建议改为：

```ts
mode: 'static' | 'dynamic' | 'hybrid'
```

`ScratchJudgeDetail.type` 需要扩展：

```ts
type =
  | ScratchStaticCheck['type']
  | ScratchStructureCheck['type']
  | ScratchDynamicCheck['type']
```

每个 detail 建议增加：

```ts
category?: 'static' | 'structure' | 'dynamic';
target?: string;
actualValue?: unknown;
expectedValue?: unknown;
```

示例结果：

```json
{
  "name": "Player reaches target position after green flag",
  "category": "dynamic",
  "type": "sprite_position",
  "target": "Player",
  "passed": false,
  "score": 0,
  "maxScore": 30,
  "message": "Player position failed: actual=(82, 0), expected=(100, 0), tolerance=5.",
  "actualValue": { "x": 82, "y": 0 },
  "expectedValue": { "x": 100, "y": 0 },
  "hint": "点击绿旗后，请让 Player 移动到 x=100, y=0 附近。"
}
```

Hydro 展示层可以继续沿用当前 `testCases` 映射，不需要重做页面。

## 7. 推荐执行步骤

### 阶段 1：扩展结构检测，不接 VM

目标：先解决“不是只做存在性检测”的问题。

执行项：

1. 扩展 `ScratchBlock` 类型，补充：
   - `inputs`
   - `parent`
   - `next`
   - `topLevel`
   - `fields`
2. 扩展 `ScratchProjectMeta`，增加：
   - `targets`
   - `scripts`
   - 每个角色的脚本链路摘要
3. 新增 `ScriptGraph` 构建逻辑：
   - 按 target 分组
   - 找到 top-level hat block
   - 沿 `next` 指针展开脚本链
   - 保留每个 block 的 opcode、fields、inputs、id
4. 新增 `structureChecks` 类型解析。
5. 实现：
   - `target_script_exists`
   - `script_sequence`
   - `script_module`
6. 增加单元测试：
   - 积木存在但在错误角色中，应失败。
   - 积木都存在但分散在不同脚本，应失败。
   - 积木顺序错误，应失败。
   - 积木顺序正确，应通过。

这一阶段不依赖 Scratch VM，风险低，建议优先做。

### 阶段 2：实现参数检测

目标：防止学生只放对积木但参数不对。

执行项：

1. 实现 `resolveInputValue(block, inputName, allBlocks)`。
2. 支持读取：
   - 数字输入
   - 字符串输入
   - 下拉字段 field
   - shadow block 默认值
3. 实现：
   - `block_input_equals`
   - `block_field_equals`
4. 增加单元测试：
   - `motion_gotoxy` 的 X/Y 判断
   - `event_whenkeypressed` 的 KEY_OPTION 判断
   - `data_setvariableto` 的变量名与值判断

这一阶段仍然不运行 VM，但可以显著提升判题有效性。

### 阶段 3：接入动态 VM 最小闭环

目标：实现运行后读取角色位置。

执行项：

1. 新增 `src/dynamic-judge.ts`。
2. 复用 `OJ_text/judge-worker/src/dynamic.ts` 的步骤执行思路。
3. 明确生产环境依赖：
   - 优先选择 npm 依赖 `scratch-vm` 或 `@scratch/scratch-vm`
   - 不依赖 `E:\moran_project\OJ_text\scratch_GUI\packages\scratch-vm` 这类本地路径
4. 实现 VM 加载：
   - `loadProject(buffer)`
   - `greenFlag()`
   - `postIOData('keyboard', ...)`
   - `stopAll()`
   - `quit()`
5. 实现 `sprite_position`。
6. 增加超时控制：
   - 单个动态测试点默认 5 秒
   - 全部动态测试点建议总超时 15 秒以内
7. 增加单元测试或集成测试：
   - 绿旗后移动到指定位置，通过。
   - 绿旗后未移动，失败。
   - 按右方向键后 x 增加，通过。
   - 找不到角色，失败并给出清晰 hint。

### 阶段 4：融合评分与页面展示

目标：让教师和学生都能看懂判题结果。

执行项：

1. `autoJudgeSummaryText` 改成中性文案：
   - `Scratch auto judge finished.`
   - 不再写死 `static`
2. `autoJudgeTestCases` 支持 category。
3. 预览 / 评分页面按类型展示：
   - 基础检查
   - 结构检查
   - 动态检查
4. 错误时保留局部得分：
   - 结构检测成功、动态 VM 加载失败时，静态和结构分数仍保留。
   - 动态部分对应测试点失败。

### 阶段 5：题目模板沉淀

目标：降低教师配置成本。

建议沉淀 3 类模板：

1. 绿旗初始化题
   - 检查角色存在
   - 检查绿旗脚本
   - 检查变量初始化
   - 动态读取变量值或角色位置
2. 按键移动题
   - 检查按键事件在指定角色中
   - 检查移动积木在同一脚本中
   - 动态模拟按键并读取位置
3. 小游戏计分题
   - 检查变量、广播、碰撞相关积木
   - 动态模拟关键输入
   - 读取变量变化

## 8. 示例题目配置

### 8.1 题目：点击绿旗后 Player 移动到 x=100, y=0

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
      "name": "Player 使用绿旗脚本",
      "type": "target_script_exists",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "score": 10,
      "hint": "请在 Player 角色中使用绿旗事件。"
    },
    {
      "name": "Player 绿旗脚本中先定位再移动",
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
      "hint": "请把定位和移动放在 Player 的同一条绿旗脚本中，并保持先后顺序。"
    }
  ],
  "dynamicChecks": [
    {
      "name": "点击绿旗后 Player 到达目标位置",
      "type": "sprite_position",
      "target": "Player",
      "expected": {
        "x": 100,
        "y": 0
      },
      "tolerance": 5,
      "score": 60,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 800 }
      ],
      "hint": "运行后 Player 应移动到 x=100, y=0 附近。"
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "defaultWaitMs": 500,
    "positionTolerance": 5
  }
}
```

### 8.2 预期判题效果

| 学生实现 | 静态 | 结构 | 动态 | 结果 |
| --- | --- | --- | --- | --- |
| 只有 Player 角色，没有脚本 | 10 | 0 | 0 | 10 分 |
| 有绿旗和移动积木，但在 Sprite1 里 | 10 | 0 | 0 | 10 分 |
| Player 里积木都存在，但顺序错误 | 10 | 部分失败 | 可能失败 | 低分 |
| Player 里顺序正确，但移动距离不够 | 10 | 30 | 动态失败 | 40 分 |
| Player 里顺序正确，最终位置正确 | 10 | 30 | 60 | 100 分 |

## 9. 主要注意事项

### 9.1 动态判题依赖最重，必须隔离失败

Scratch VM 依赖体积大、启动慢、运行环境复杂。动态判题失败时，不能导致整个提交流程崩掉。

建议策略：

- 每个动态测试点单独 try/catch。
- VM 加载失败时，动态测试点失败并给出错误信息。
- 静态 / 结构得分仍然保留。
- 提交记录仍然生成，不丢学生作品。

### 9.2 动态判题不能无限运行

学生作品可能包含无限循环、克隆、声音、异常扩展。

必须限制：

- 单测试点超时
- 总判题超时
- 项目大小
- project.json 大小
- 资源数量
- 禁用扩展

当前 0.3.0 已有大小和资源校验，动态阶段需要继续复用。

### 9.3 位置判断必须使用容差

Scratch 坐标可能因为运行等待时间、积木执行调度、浮点数而存在轻微差异。

不要用绝对相等判断坐标。

建议默认：

```text
tolerance = 3 或 5
```

教师可在单个测试点里覆盖。

### 9.4 不要只看最终位置，也要看结构

如果只做动态位置检测，学生可能用非常规方式绕过教学目标，例如直接设置坐标，而没有使用本节课要求的移动积木。

所以推荐评分组合：

```text
基础存在性：10%-20%
结构顺序：30%-40%
动态结果：40%-60%
```

这样既检查学习过程，也检查运行结果。

### 9.5 顺序检测要允许中间插入积木

教学题里学生常常会插入显示、等待、说话、音效等辅助积木。第一版如果要求严格连续，很容易误伤。

建议默认使用：

```text
ordered_subsequence
```

也就是关键积木顺序正确即可，中间允许其他积木。

### 9.6 中文编码需要顺手修复

当前部分历史文件和测试输出里出现过中文乱码。升级判题时建议同时检查：

- TypeScript 源码是否 UTF-8
- 模板是否 UTF-8
- JSON API 响应头是否带 `charset=utf-8`
- PowerShell 自动化脚本是否用 UTF-8 读写

判题结果最终面向学生，提示文字必须稳定显示。

### 9.7 第一版不要追求完整 Scratch 模拟

动态判题第一版目标应该是稳定可控，不是完整覆盖 Scratch 所有行为。

建议第一版只支持：

- 绿旗
- 等待
- 键盘输入
- 变量值读取
- 角色 x/y 读取

鼠标、克隆、广播链、碰撞、列表内容、造型、方向可以放到后续版本。

## 10. 推荐版本路线

### 0.4.0：结构判题 + 动态位置最小闭环

必须包含：

- `structureChecks`
- `target_script_exists`
- `script_sequence`
- `script_module`
- `dynamicChecks.sprite_position`
- `ScratchJudgeResult.mode = static | dynamic | hybrid`
- 基础测试覆盖

### 0.4.1：参数检测与中文显示优化

建议包含：

- `block_input_equals`
- `block_field_equals`
- 中文提示稳定显示
- 判题报告分组展示

### 0.5.0：题目模板与教师辅助配置

建议包含：

- 绿旗初始化模板
- 按键移动模板
- 计分变量模板
- 配置页面提供 JSON 示例或生成按钮

## 11. 最终建议

建议下一步不要立刻全面接动态 VM，而是按以下优先级执行：

1. 先做结构判题，让“指定角色 + 指定脚本 + 基本顺序”可用。
2. 再做 `sprite_position`，完成动态结果判定最小闭环。
3. 保留现有静态规则，形成静态 + 结构 + 动态的混合评分。
4. 每一种新规则都先用最小 `.sb3` 单元测试验证，再上线真实 Hydro 测试题。

这样风险最低，也最贴合当前需求：既防止学生只堆积木骗过存在性检测，又能通过动态结果检查确认作品真的运行到了题目要求的状态。
