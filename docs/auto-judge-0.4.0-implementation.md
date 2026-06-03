# Scratch 自动测评 0.4.0 实现说明

本次版本把 0.3.0 的“存在性静态检测”升级为“静态 + 结构 + 动态”的混合判题。

## 新增能力

- `staticChecks`：保留原有角色、变量、列表、广播、积木存在性检测。
- `structureChecks`：新增限定角色和脚本结构的检测。
  - `target_script_exists`
  - `script_sequence`
  - `script_module`
  - `block_input_equals`
  - `block_field_equals`
- `dynamicChecks`：新增 Scratch VM 动态运行检测。
  - `runtime_runs`
  - `variable_value`
  - `sprite_position`

## 判题模式

- `manual`：不自动判题，保留人工评分。
- `static`：运行 `staticChecks` 和 `structureChecks`。
- `dynamic`：只运行 `dynamicChecks`。
- `hybrid`：运行 `staticChecks`、`structureChecks`、`dynamicChecks`。

## 稳定性策略

- 配置解析集中在 `normalizeJudgeConfig`，非法配置会在题目保存时提示。
- 动态判题按测试点隔离，单个动态测试点失败不会导致提交文件丢失。
- `sprite_position` 使用 `tolerance` 容差，不做坐标绝对相等判断。
- VM 加载失败会变成动态测试点失败结果，而不是让整个提交崩溃。
- `Static` 模式不加载 Scratch VM，避免普通静态题受到动态依赖影响。

## 主要代码位置

- `src/static-judge.ts`：配置解析、静态判题、结构判题、统一结果汇总。
- `src/dynamic-judge.ts`：Scratch VM 加载、步骤执行、变量读取、角色位置读取。
- `src/types.ts`：新增结构和动态判题类型。
- `src/http.ts`：根据 `judgeMode` 选择判题组合并回写 Hydro Record。
- `test/sb3.test.ts`：新增结构顺序、错误顺序、动态位置测试。

## 示例配置

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "Player sprite exists",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10
    }
  ],
  "structureChecks": [
    {
      "name": "Player green flag script has expected order",
      "type": "script_sequence",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "sequence": [
        "event_whenflagclicked",
        "motion_gotoxy",
        "motion_movesteps"
      ],
      "score": 30
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player reaches target position",
      "type": "sprite_position",
      "target": "Player",
      "expected": { "x": 100, "y": 0 },
      "tolerance": 5,
      "score": 60,
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

## 后续建议

- 下一版优先优化中文判题报告展示。
- 增加教师端配置模板，减少手写 JSON。
- 增加 `sprite_direction`、`sprite_visible`、`sprite_costume` 等动态检查。
- 为常见 Scratch 题型沉淀模板：绿旗初始化、按键移动、变量计分、广播交互。
