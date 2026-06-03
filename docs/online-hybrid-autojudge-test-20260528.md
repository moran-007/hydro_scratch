# Scratch 0.4.0 Hybrid 自动测评线上测试结果

测试日期：2026-05-28  
测试站点：http://moran007.top  
测试插件版本：0.4.0（线上 `scratch-editor/index.html` 已显示 `gui.js?v=0.4.0`）  
测试目标：验证 0.4.0 新增的“静态 + 结构 + 动态”混合自动测评是否可在线上完整运行。

> 说明：本次测试使用用户提供的管理员账号和学生账号完成，但本文档不记录账号密码。

## 1. 测试结论

本次 Hybrid 自动测评闭环通过。

- 管理员可以创建 Scratch 自动测评题目。
- 题目配置页可以保存 `staticChecks`、`structureChecks`、`dynamicChecks`。
- 学生提交 `.sb3` 后，系统可以自动执行：
  - 静态存在性检测
  - 指定角色脚本结构检测
  - 积木顺序检测
  - 积木输入参数检测
  - Scratch VM 动态角色位置检测
- 通过样例被判定为 `Accepted`，得分 `100 / 100`。
- 失败样例被判定为 `Wrong Answer`，得分 `20 / 100`。
- 自动测评结果已写入提交记录、报告接口和 Hydro Record。

## 2. 线上测试题目

题目 ID：`scratchdyn0528064129`  
题目标题：`Scratch Hybrid Auto Judge Test 0528064129`  
题目地址：http://moran007.top/p/scratchdyn0528064129  
配置地址：http://moran007.top/scratch/problem/scratchdyn0528064129/config  
提交列表：http://moran007.top/scratch/problem/scratchdyn0528064129/submissions

题目要求：

1. 创建或保留名为 `Player` 的角色。
2. 在 `Player` 角色中使用绿旗脚本。
3. 绿旗脚本中先使用 `motion_gotoxy`，把角色移动到 `x=-150, y=0`。
4. 再使用 `motion_movesteps` 移动 `250` 步。
5. 运行后，`Player` 的最终位置应接近 `x=100, y=0`。

## 3. 判题模式与测试点

判题模式：`Hybrid`

总分：`100`

| 分类 | 测试点 | 类型 | 分值 |
| --- | --- | --- | ---: |
| static | Player sprite exists | `sprite_exists` | 10 |
| structure | Player has green flag script | `target_script_exists` | 10 |
| structure | Player script order is correct | `script_sequence` | 20 |
| structure | Player starts at x -150 y 0 | `block_input_equals` | 20 |
| dynamic | Player reaches x 100 y 0 after green flag | `sprite_position` | 40 |

完整配置：

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "Player sprite exists",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10,
      "hint": "Create or rename a sprite to Player."
    }
  ],
  "structureChecks": [
    {
      "name": "Player has green flag script",
      "type": "target_script_exists",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "score": 10,
      "hint": "Add the green flag script on Player."
    },
    {
      "name": "Player script order is correct",
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
      "hint": "Put go to x/y before move steps in the same Player green flag script."
    },
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
      "score": 20,
      "hint": "Use go to x=-150 y=0 before moving."
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player reaches x 100 y 0 after green flag",
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
      "hint": "After running, Player should be close to x=100 y=0."
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "defaultWaitMs": 800,
    "positionTolerance": 5
  }
}
```

## 4. 测试样例设计

### 4.1 通过样例

通过样例 `.sb3` 的核心脚本：

```text
Player:
event_whenflagclicked
-> motion_gotoxy X=-150 Y=0
-> motion_movesteps STEPS=250
```

预期：

- 存在 `Player`。
- `Player` 有绿旗脚本。
- 脚本顺序正确。
- `motion_gotoxy` 参数正确。
- 运行后最终位置为 `x=100, y=0`。
- 得分 `100 / 100`，状态 `Accepted`。

### 4.2 失败样例

失败样例 `.sb3` 的核心脚本：

```text
Player:
event_whenflagclicked
-> motion_movesteps STEPS=10
```

预期：

- 存在 `Player`，静态检测通过。
- `Player` 有绿旗脚本，入口检测通过。
- 缺少 `motion_gotoxy`，顺序检测失败。
- 缺少 `motion_gotoxy X=-150 Y=0`，参数检测失败。
- 运行后最终位置为 `x=10, y=0`，动态位置检测失败。
- 得分 `20 / 100`，状态 `Wrong Answer`。

## 5. 实际提交结果

| 样例 | 提交 RID | HTTP/提交结果 | Hydro 状态 | 得分 | 结论 |
| --- | --- | --- | --- | ---: | --- |
| 通过样例 | `6a17e3990c306ee236ef419f` | 成功 | `Accepted` | `100 / 100` | 符合预期 |
| 失败样例 | `6a17e39b0c306ee236ef41a7` | 成功 | `Wrong Answer` | `20 / 100` | 符合预期 |

通过样例记录：http://moran007.top/record/6a17e3990c306ee236ef419f  
失败样例记录：http://moran007.top/record/6a17e39b0c306ee236ef41a7

## 6. 测试点明细

### 6.1 通过样例明细

| 分类 | 测试点 | 结果 | 得分 | 系统消息 |
| --- | --- | --- | ---: | --- |
| static | Player sprite exists | 通过 | `10 / 10` | `Found sprite: Player` |
| structure | Player has green flag script | 通过 | `10 / 10` | `Found event_whenflagclicked script in Player.` |
| structure | Player script order is correct | 通过 | `20 / 20` | `Found sequence in Player: event_whenflagclicked -> motion_gotoxy -> motion_movesteps.` |
| structure | Player starts at x -150 y 0 | 通过 | `20 / 20` | `Block motion_gotoxy inputs matched in Player.` |
| dynamic | Player reaches x 100 y 0 after green flag | 通过 | `40 / 40` | `Sprite Player position passed: actual=(100, 0), expected=(100, 0), tolerance=5.` |

### 6.2 失败样例明细

| 分类 | 测试点 | 结果 | 得分 | 系统消息 |
| --- | --- | --- | ---: | --- |
| static | Player sprite exists | 通过 | `10 / 10` | `Found sprite: Player` |
| structure | Player has green flag script | 通过 | `10 / 10` | `Found event_whenflagclicked script in Player.` |
| structure | Player script order is correct | 不通过 | `0 / 20` | `Missing ordered sequence in Player: event_whenflagclicked -> motion_gotoxy -> motion_movesteps.` |
| structure | Player starts at x -150 y 0 | 不通过 | `0 / 20` | `Block motion_gotoxy inputs did not match in Player.` |
| dynamic | Player reaches x 100 y 0 after green flag | 不通过 | `0 / 40` | `Sprite Player position failed: actual=(10, 0), expected=(100, 0), tolerance=5.` |

## 7. 本次验证到的 0.4.0 功能

- `Auto Judge Config` 可以保存新版 schema。
- `Hybrid` 模式可以同时执行三类测试点。
- `staticChecks.sprite_exists` 正常。
- `structureChecks.target_script_exists` 能限定脚本必须在指定角色 `Player` 内。
- `structureChecks.script_sequence` 能识别同一脚本中的基本顺序。
- `structureChecks.block_input_equals` 能读取 `motion_gotoxy` 的 `X`、`Y` 输入参数。
- `dynamicChecks.sprite_position` 能通过 Scratch VM 运行项目并读取角色最终坐标。
- 动态位置检测支持 `tolerance` 容差。
- 自动测评结果可以回写 Hydro 状态：
  - 满分为 `Accepted`
  - 非满分为 `Wrong Answer`
- 提交报告中可以看到 `static`、`structure`、`dynamic` 分类明细。

## 8. 注意事项

1. 本次测试入口使用 `http://moran007.top`。
2. 动态判题依赖服务端 `scratch-vm`，本次线上测试已经证明当前部署可以加载并运行 VM。
3. `sprite_position` 建议始终配置 `tolerance`，本次使用 `5`。
4. 失败样例得到 `20 / 100` 是预期结果，因为它仍然满足：
   - 存在 `Player`
   - `Player` 有绿旗脚本
5. 结构检测和动态检测组合后，已经可以避免“只拖入积木但没有按要求实现模块”的大部分情况。

## 9. 原始测试数据

原始 JSON 结果文件：

`E:\Users\moran\Documents\hydro_chajian\release\auto-hybrid-test-scratchdyn0528064129.json`

该文件包含题目地址、判题配置、两次提交返回值、自动测评报告和样例 `.sb3` 生成路径。
