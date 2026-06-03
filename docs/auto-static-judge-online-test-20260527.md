# Scratch 自动静态测评线上测试结果

测试日期：2026-05-27  
测试站点：http://moran007.top  
测试插件版本：0.3.0（线上编辑器资源已显示 `gui.js?v=0.3.0`）  
测试目标：验证 Scratch 自动静态测评系统是否可以完成“创建题目 -> 配置测试点 -> 学生提交 -> 自动评分 -> 写入 Hydro 记录”的闭环。

> 说明：本次测试使用用户提供的管理员账号和学生账号完成，但本文档不记录账号密码。

## 1. 测试结论

本次自动静态测评闭环通过。

- 管理员可以创建 Scratch 题目并保存静态测评配置。
- 学生提交 `.sb3` 后，系统会自动解析 `project.json` 并执行静态规则。
- 通过样例被判定为 `Accepted`，得分 `100 / 100`。
- 失败样例被判定为 `Wrong Answer`，得分 `25 / 100`。
- 测评结果已写入提交返回值、提交报告和 Hydro 记录状态。

本版本可以作为“第一个可自动静态测试的大版本”继续试用。后续重点应放在题目测试点规则的规范化、中文显示/编码细节确认、以及更复杂 Scratch 行为规则的扩展。

## 2. 线上测试题目

题目 ID：`scratchautotest0527224240`  
题目标题：`Scratch Auto Static Judge Test 0527224240`  
题目地址：http://moran007.top/p/scratchautotest0527224240  
配置地址：http://moran007.top/scratch/problem/scratchautotest0527224240/config  
提交列表：http://moran007.top/scratch/problem/scratchautotest0527224240/submissions

题目要求学生提交一个 Scratch 项目，项目需要满足以下条件：

1. 存在名为 `Player` 的角色。
2. 存在名为 `score` 的变量。
3. 存在绿旗事件积木 `event_whenflagclicked`。
4. 至少存在一个移动类积木：`motion_movesteps`、`motion_changexby`、`motion_changeyby`。

## 3. 静态测评配置

总分：`100`

```json
{
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "Sprite Player exists",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 25,
      "hint": "Create or rename a sprite to Player."
    },
    {
      "name": "Variable score exists",
      "type": "variable_exists",
      "variable": "score",
      "score": 25,
      "hint": "Create a variable named score."
    },
    {
      "name": "Green flag event exists",
      "type": "block_exists",
      "opcode": "event_whenflagclicked",
      "score": 25,
      "hint": "Add the green flag event block."
    },
    {
      "name": "Motion block exists",
      "type": "block_exists_any",
      "opcodes": [
        "motion_movesteps",
        "motion_changexby",
        "motion_changeyby"
      ],
      "score": 25,
      "hint": "Add at least one motion block."
    }
  ]
}
```

## 4. 测试样例设计

### 4.1 通过样例

通过样例 `.sb3` 的核心内容：

- Stage：`Stage`
- 角色：`Player`
- 变量：`score`
- 积木：`event_whenflagclicked`
- 积木：`motion_movesteps`

预期结果：

- 4 个测试点全部通过。
- 总分 `100 / 100`。
- Hydro 状态为 `Accepted`。

### 4.2 失败样例

失败样例 `.sb3` 的核心内容：

- Stage：`Stage`
- 角色：`Cat`
- 没有 `score` 变量
- 积木：`event_whenflagclicked`
- 没有移动类积木

预期结果：

- 只通过“绿旗事件积木存在”测试点。
- 总分 `25 / 100`。
- Hydro 状态为 `Wrong Answer`。

## 5. 实际提交结果

| 样例 | 提交 RID | HTTP 状态 | Hydro 状态 | 得分 | 结论 |
| --- | --- | ---: | --- | ---: | --- |
| 通过样例 | `6a1702e09fec62cc1dcb94b0` | 200 | `Accepted` | `100 / 100` | 符合预期 |
| 失败样例 | `6a1702e19fec62cc1dcb94b8` | 200 | `Wrong Answer` | `25 / 100` | 符合预期 |

通过样例记录：http://moran007.top/record/6a1702e09fec62cc1dcb94b0  
失败样例记录：http://moran007.top/record/6a1702e19fec62cc1dcb94b8

## 6. 测试点明细

### 6.1 通过样例明细

| 测试点 | 类型 | 实际结果 | 得分 | 证据 |
| --- | --- | --- | ---: | --- |
| Sprite Player exists | `sprite_exists` | 通过 | `25 / 25` | 找到角色 `Player` |
| Variable score exists | `variable_exists` | 通过 | `25 / 25` | 找到变量 `score` |
| Green flag event exists | `block_exists` | 通过 | `25 / 25` | 找到 `event_whenflagclicked` |
| Motion block exists | `block_exists_any` | 通过 | `25 / 25` | 找到 `motion_movesteps` |

项目解析信息：

- Stage：`Stage`
- 角色列表：`Player`
- 变量列表：`score`
- 积木列表：`event_whenflagclicked`、`motion_movesteps`
- 积木数量：`2`
- `.sb3` 校验：通过，未发现 warning

### 6.2 失败样例明细

| 测试点 | 类型 | 实际结果 | 得分 | 证据 |
| --- | --- | --- | ---: | --- |
| Sprite Player exists | `sprite_exists` | 不通过 | `0 / 25` | 只找到角色 `Cat` |
| Variable score exists | `variable_exists` | 不通过 | `0 / 25` | 未找到变量 `score` |
| Green flag event exists | `block_exists` | 通过 | `25 / 25` | 找到 `event_whenflagclicked` |
| Motion block exists | `block_exists_any` | 不通过 | `0 / 25` | 未找到 `motion_movesteps` / `motion_changexby` / `motion_changeyby` |

项目解析信息：

- Stage：`Stage`
- 角色列表：`Cat`
- 变量列表：空
- 积木列表：`event_whenflagclicked`
- 积木数量：`1`
- `.sb3` 校验：通过，未发现 warning

## 7. 本次验证到的功能点

- `.sb3` 文件上传后可以被插件保存到 Hydro Storage。
- 自动测评可以读取 `.sb3` 内部的 `project.json`。
- 自动测评可以识别角色、变量、积木 opcode。
- 题目配置中的 `judgeConfig.staticChecks` 可以被保存并在提交时使用。
- 自动测评结果可以生成：
  - 总分
  - 最大分
  - 是否通过
  - 每个测试点的通过状态
  - 每个测试点的得分
  - 项目元信息
- 测评结果可以回写到提交记录，最终表现为 Hydro 的 `Accepted` 或 `Wrong Answer`。

## 8. 注意事项与后续优化

1. 当前版本是静态测评，不执行 Scratch 项目的运行时逻辑。
   - 适合检查角色、变量、列表、广播、积木类型、积木数量、禁用积木等结构性要求。
   - 不适合直接判断“角色是否真的移动到指定位置”“变量运行后是否变成某个值”等动态行为。

2. 测试点规则需要继续沉淀成题目模板。
   - 建议先做常用 Scratch 题型模板，例如：角色命名类、变量计分类、按键控制类、广播通信类、循环/条件类。
   - 每类模板给出推荐 `judgeConfig`，减少教师手写 JSON 的成本。

3. 中文显示需要在线上继续确认。
   - 本次自动化脚本抓取的原始 JSON 中，部分内部中文提示出现了编码展示异常，但测试点名称、得分、状态和英文 hint 均正常。
   - 浏览器页面如需完全中文化，建议下一轮重点检查响应头、模板编码、API 返回编码，以及 PowerShell 自动化抓取方式。

4. HTTPS 暂未作为测试入口。
   - 本次访问 `https://moran007.top/` 时 TLS 握手失败，因此实际测试入口使用 `http://moran007.top`。
   - 如果正式教学环境需要 HTTPS，建议单独修复证书/反向代理配置。

5. 安全建议。
   - 本次测试账号密码由用户提供，测试文档不记录密码。
   - 后续公开演示或多人试用前，建议更换弱密码并限制管理员账号暴露范围。

## 9. 原始测试数据

原始 JSON 结果文件：

`E:\Users\moran\Documents\hydro_chajian\release\auto-static-test-scratchautotest0527224240.json`

该文件包含本次测试创建的题目地址、测评配置、两次提交的返回值、自动测评报告和项目解析元信息。
