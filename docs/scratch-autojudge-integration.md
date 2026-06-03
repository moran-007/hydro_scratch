# Scratch 自动测评整合可执行文档

本文档面向当前插件目录：

```text
E:\Users\moran\Documents\hydro_chajian
```

目标是把 `E:\moran_project\OJ_text\judge-worker` 的 Scratch `.sb3` 自动测评能力整合进当前 Hydro Scratch 插件。GUI 已经具备，不纳入本次范围；`E:\moran_project\OJ_text\hydro-plugin-scratch-oj` 是当前插件前身，也不作为整合对象。

## 1. 结论

可行，建议采用“嵌入当前插件 + 保持判题核心独立”的路线。

当前插件已经具备：

- Hydro 题目创建、配置、编辑器入口、草稿、提交、预览、下载。
- `.sb3` 上传校验和 Hydro Storage 存储。
- Hydro Record 创建。
- 手动评分和 `HydroApi.judge.end(...)` 成绩回写。
- `judgeMode` 类型已预留 `manual | static | dynamic | hybrid`。

`OJ_text/judge-worker` 已经具备：

- `judgeSb3File(filePath, config)` 入口。
- `.sb3` 解包读取 `project.json`。
- 静态测试点：角色、变量、列表、广播、积木、禁用积木、积木数量。
- 动态测试点：启动 VM、绿旗、等待、按键、变量读取比较。
- 测试点生成工具。
- 结构化 `JudgeResult` 输出。

本机验证结果：

- `judge-worker` TypeScript typecheck 通过。
- 测试点生成器 `--strict` 可生成总分一致的配置。
- 静态判题能对现有 `.sb3` 样例输出结构化结果。
- 动态 `runtime_runs` 能通过本地 `scratch_GUI/packages/scratch-vm` 启动 VM 跑通。

## 2. 推荐架构

推荐形态：

```text
当前 Hydro 插件
  ├─ 提交、存储、权限、页面、Hydro 成绩回写
  ├─ src/judge/                 # 新增薄封装层
  │   ├─ adapter.ts             # 调用 judge-worker，处理错误和结果映射
  │   ├─ result.ts              # Hydro 状态、testCases、judgeTexts 映射
  │   └─ config.ts              # judgeConfig 校验和默认值
  └─ vendor 或依赖包
      └─ judge-worker           # 保持独立，不把 OJ_text 后端搬进来
```

不要迁移 `OJ_text/frontend`、`OJ_text/backend`、`scratch_GUI` 到当前插件。当前插件只需要复用 `judge-worker` 的判题核心和测试点配置格式。

## 3. 判题核心能力确认

### 3.1 入口

`judge-worker/src/index.ts` 暴露：

```text
judgeSb3File(filePath, config) -> Promise<JudgeResult>
judgeScratchProject(project, config) -> JudgeResult
readProjectFromSb3(buffer) -> ScratchProject
```

其中 `judgeSb3File` 的流程是：

```text
读取 .sb3 文件
-> JSZip 解包
-> 读取 project.json
-> collectProjectMeta
-> buildStaticDetails
-> runDynamicChecks
-> createJudgeResult
```

这与当前插件的提交流程高度匹配，因为当前插件在提交时已有临时上传文件路径 `file.filepath`，可以在存入 Hydro Storage 前后直接调用。

### 3.2 静态判题支持项

可直接接入：

```text
sprite_exists
variable_exists
list_exists
broadcast_exists
block_exists
block_exists_any
forbidden_block_absent
min_block_count
```

静态判题只需要读取 `project.json`，部署风险低，适合第一阶段上线。

### 3.3 动态判题支持项

当前动态步骤：

```text
green_flag
wait
key_down
key_up
key_press
```

当前动态检查：

```text
runtime_runs
variable_value
```

变量比较支持：

```text
exists
equals
not_equals
greater_than
greater_or_equal
less_than
less_or_equal
changed
```

动态判题已经可运行，但生产部署要额外处理 `scratch-vm` 依赖。当前 `judge-worker/package.json` 只有 `jszip`，未声明 `@scratch/scratch-vm` 或 `scratch-vm`。本机动态能跑，是因为它能从：

```text
E:\moran_project\OJ_text\scratch_GUI\packages\scratch-vm
```

找到本地 Scratch VM 源码或构建产物。生产环境不能依赖这个 Windows 本地路径。

## 4. 当前插件接入点

### 4.1 配置层

当前 `src/types.ts` 已有：

```text
ScratchJudgeMode = manual | static | dynamic | hybrid
ScratchProblemConfig.maxScore
```

但 `ScratchProblemConfig` 还没有保存 `judgeConfig`。因此需要新增：

```text
judgeConfig?: JudgeConfig
autoJudgeVersion?: number
lastJudgeConfigUpdatedAt?: Date
```

最小可行版本只需要 `judgeConfig?: JudgeConfig`。

### 4.2 提交流程

当前 `ScratchSubmitHandler.post(...)` 流程：

```text
校验 Scratch 题目启用
-> 校验提交来源 upload/editor
-> 校验文件大小
-> validateScratchProject(...)
-> HydroApi.record.add(...)
-> HydroApi.storage.put(...)
-> ScratchModel.addSubmission(...)
-> HydroApi.record.update(... STATUS_IGNORED ...)
-> 统计提交数、比赛/作业状态
-> 返回 Waiting
```

自动测评应插入在：

```text
validateScratchProject 成功之后
HydroApi.record.add / storage.put / ScratchModel.addSubmission 周围
```

推荐先创建 Record 和 Submission，再进入 `judging` 状态，随后运行判题，最后用统一映射回写。

### 4.3 成绩回写

当前手动评分已经使用：

```text
HydroApi.judge.end(effectiveDomainId, rid, {
  status,
  score,
  time,
  memory,
  message,
  case,
  judger
})
```

这正是自动测评应该复用的接口。自动测评不需要重新研究 Hydro 成绩系统。

## 5. 分阶段实施步骤

### 阶段 0：确认依赖策略

先决定 `judge-worker` 如何进入当前插件。

推荐优先级：

1. 把 `judge-worker/src` 复制或抽成当前插件内部 `src/judge-worker`，随插件一起编译。
2. 或把 `judge-worker` 做成 workspace/file dependency，但生产打包要确保 `dist` 和依赖一起进入插件包。
3. 不推荐运行外部 `OJ_text/backend` 服务再 HTTP 调用，除非只是临时演示。

动态判题依赖策略必须单独确认：

```text
静态判题：只需要 JSZip 或复用当前 yauzl 解析逻辑。
动态判题：必须让生产环境可 require 到 @scratch/scratch-vm / scratch-vm / 构建后的 scratch-vm。
```

如果第一阶段只上线静态判题，可以先不处理 `scratch-vm` 生产依赖。

### 阶段 1：加入 judgeConfig 数据结构

在当前插件配置中加入 `judgeConfig`。

执行项：

1. `src/types.ts`：`ScratchProblemConfig` 增加 `judgeConfig?: JudgeConfig`。
2. `src/config.ts`：`defaultProblemConfig` 增加默认空配置。
3. `src/config.ts`：`normalizeProblemConfig` 校验并保留 `judgeConfig`。
4. `src/http.ts`：`buildScratchConfigPatch` 支持从表单或 JSON body 接收 `judgeConfig`。
5. 配置页面增加 JSON 文本域，支持粘贴 `judgeConfig`。

第一版配置页面不需要复杂 UI，只要能粘贴 JSON 即可。

建议默认值：

```json
{
  "totalScore": 100,
  "staticChecks": []
}
```

### 阶段 2：接入静态自动测评

新增一个薄封装函数：

```text
runScratchAutoJudge(filePath, scratchConfig)
```

输入：

```text
filePath: 当前上传的临时 .sb3 路径
scratchConfig: 当前题目的 ScratchProblemConfig
```

行为：

```text
如果 judgeMode = manual：不运行自动测评
如果 judgeMode = static：只运行 staticChecks
如果 judgeMode = hybrid：运行 staticChecks；dynamicChecks 可暂时忽略或配置为空
如果 judgeMode = dynamic：要求 dynamicChecks 存在，否则返回配置错误
```

第一阶段建议：

```text
manual：沿用现状，Waiting for manual score
static：提交后立即自动评分
hybrid：自动评分后仍允许老师手动覆盖
dynamic：如果生产依赖未准备好，先不开放
```

### 阶段 3：结果映射到 Hydro

`JudgeResult` 到 Hydro 的映射建议：

```text
result.passed = true
  -> STATUS_ACCEPTED

result.passed = false 且 totalScore > 0
  -> STATUS_WRONG_ANSWER

判题异常
  -> STATUS_WRONG_ANSWER 或 STATUS_SYSTEM_ERROR
  -> 具体取决于 Hydro 当前可用状态常量
```

分数：

```text
score = result.totalScore
maxScore = result.maxScore
```

`testCases` 建议每个 `JudgeDetail` 对应一条：

```text
id: index
subtaskId: 0
status: detail.passed ? ACCEPTED : WRONG_ANSWER
score: detail.score
message: detail.message + hint
```

`judgeTexts` 建议保留：

```text
Scratch auto judge finished.
Score: x/y
Passed checks: a/b
Failed: 测试点名 + hint
```

### 阶段 4：更新提交后的状态

当前提交后固定写：

```text
STATUS_IGNORED
score: 0
message: Scratch project saved without automatic judging.
```

自动测评后应改为：

```text
manual:
  status = STATUS_IGNORED
  scored = false
  response.status = Waiting

static/dynamic:
  status = result 映射状态
  scored = true
  response.status = Accepted / Wrong Answer

hybrid:
  status = result 映射状态
  scored = true
  manualScoreBy 为空
  页面保留“人工复核/覆盖评分”
```

`ScratchModel.updateSubmission(...)` 需要同步写入：

```text
score
maxScore
status
scored
autoJudgeResult
autoJudgeAt
```

当前 `ScratchSubmissionMeta` 没有 `autoJudgeResult` 字段，建议新增：

```text
autoJudgeResult?: JudgeResult
autoJudgeAt?: Date
autoJudgeError?: string
```

### 阶段 5：加入结果展示

最低可用展示：

1. 提交列表显示自动分数。
2. 预览页显示自动测评详情。
3. 手动评分页显示自动评分作为参考。

建议新增一个区域：

```text
自动测评结果
总分：80 / 100
状态：未通过
通过测试点：4 / 5

测试点列表：
- 存在 Player 角色：通过，20/20
- 使用 forever 循环：失败，0/20，提示：请加入重复执行积木
```

### 阶段 6：引入动态判题

动态判题上线前必须完成：

1. 生产环境能稳定加载 Scratch VM。
2. 每个动态测试点有超时。
3. 单次提交有总超时。
4. VM 日志不会污染 Hydro 日志。
5. 没有 renderer 的 warning 不影响变量类判题。
6. 复杂题目先限制为变量状态检查，不直接承诺坐标、碰撞、声音等能力。

推荐动态上线顺序：

```text
runtime_runs
variable_value + green_flag
variable_value + key_press
movement_counter 模板
costume_state 模板
后续再扩展 target_property / list_value / sound_event
```

## 6. 题目配置工作流

老师出题建议流程：

1. 在 Hydro 创建普通 Scratch 题目。
2. 进入 Scratch 插件配置页。
3. 设置 `judgeMode = static` 或 `hybrid`。
4. 粘贴 `judgeConfig`。
5. 用一份正确 `.sb3` 和一份错误 `.sb3` 各提交一次。
6. 确认提交列表、Record、比赛/作业成绩都同步正确。

测试点生成器可作为离线工具使用：

```bash
node E:\moran_project\OJ_text\judge-worker\scripts\generate-test-points.mjs ^
  E:\moran_project\OJ_text\backend\data\test-point-spec.example.json ^
  --strict
```

生成结果中的 `staticChecks` 和 `dynamicChecks` 可以粘贴到当前插件的 `judgeConfig`。

## 7. 推荐 judgeConfig 示例

第一阶段静态题：

```json
{
  "problemId": 1001,
  "title": "小猫移动挑战",
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 20,
      "hint": "请创建或重命名一个角色为 Player。"
    },
    {
      "name": "存在 score 变量",
      "type": "variable_exists",
      "variable": "score",
      "score": 20,
      "hint": "请创建 score 变量。"
    },
    {
      "name": "使用循环",
      "type": "block_exists_any",
      "opcodes": ["control_forever", "control_repeat"],
      "score": 20,
      "hint": "请使用重复执行或重复指定次数。"
    },
    {
      "name": "使用按键检测",
      "type": "block_exists",
      "opcode": "sensing_keypressed",
      "score": 20,
      "hint": "请使用按下某键？积木。"
    },
    {
      "name": "使用移动积木",
      "type": "block_exists_any",
      "opcodes": ["motion_movesteps", "motion_changexby", "motion_changeyby"],
      "score": 20,
      "hint": "请加入角色移动相关积木。"
    }
  ]
}
```

第二阶段混合题：

```json
{
  "problemId": 1002,
  "title": "空格键加分",
  "totalScore": 100,
  "dynamicOptions": {
    "defaultWaitMs": 300,
    "keyPressMs": 100,
    "timeoutMs": 6000
  },
  "staticChecks": [
    {
      "name": "存在 score 变量",
      "type": "variable_exists",
      "variable": "score",
      "score": 10
    },
    {
      "name": "使用按键事件",
      "type": "block_exists",
      "opcode": "event_whenkeypressed",
      "score": 10
    },
    {
      "name": "使用变量增加",
      "type": "block_exists",
      "opcode": "data_changevariableby",
      "score": 10
    }
  ],
  "dynamicChecks": [
    {
      "name": "绿旗后 score 初始化为 0",
      "type": "variable_value",
      "variable": "score",
      "expected": 0,
      "operator": "equals",
      "score": 30,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 300 }
      ]
    },
    {
      "name": "按空格后 score 至少为 1",
      "type": "variable_value",
      "variable": "score",
      "expected": 1,
      "operator": "greater_or_equal",
      "score": 40,
      "steps": [
        { "action": "green_flag" },
        { "action": "wait", "ms": 200 },
        { "action": "key_press", "key": "space", "ms": 100 },
        { "action": "wait", "ms": 300 }
      ]
    }
  ]
}
```

## 8. 关键风险和处理办法

### 8.1 动态判题依赖风险

问题：

```text
judge-worker 当前未声明 @scratch/scratch-vm / scratch-vm 依赖。
```

处理：

- 静态判题先上线。
- 动态判题上线前，把 Scratch VM 作为明确生产依赖或随插件 vendor。
- 不要依赖本机 `E:\moran_project\OJ_text\scratch_GUI` 路径。

### 8.2 文件路径风险

当前插件使用 Hydro Storage 的逻辑路径：

```text
submission/<id>
```

`judgeSb3File` 需要真实文件路径。提交时 `file.filepath` 是可用真实路径，因此建议在上传请求生命周期内直接判题，不要等文件只剩 Storage key 后再判。

如果未来要异步判题，则需要：

```text
Hydro Storage -> 临时本地文件 -> judgeSb3File -> 删除临时文件
```

### 8.3 判题耗时风险

静态判题很快。动态判题启动 VM 明显更慢，本机一次 `runtime_runs` 约数十秒级启动成本，后续需要实际压测。

处理：

- 第一阶段同步静态判题。
- 动态判题建议做队列或后台任务。
- 每个动态点必须设置 `timeoutMs`。
- 单次提交建议设置总超时，例如 15 到 30 秒。

### 8.4 误判风险

只检查积木会误判“摆了但没连起来”的作品。

处理：

- 基础结构题可用静态。
- 行为题必须用动态变量检查。
- 移动/造型/碰撞类题，在未实现直接读取角色状态前，要求学生同步维护变量，例如 `steps`、`costumeState`、`hit`。

### 8.5 手动评分覆盖

自动测评不能完全替代老师。

处理：

- 保留现有手动评分页。
- `hybrid` 模式下，自动评分先给分，老师可覆盖。
- 元数据中区分 `autoJudgeResult` 和 `manualScoreBy/manualScoreAt`。

### 8.6 比赛/作业成绩同步

当前提交会调用：

```text
HydroApi.contest.updateStatus(...)
```

手动评分会调用：

```text
HydroApi.judge.end(...)
```

自动测评也必须调用 `HydroApi.judge.end(...)`，并验证比赛/作业榜单能更新。

## 9. 验收清单

### 静态判题验收

- 创建 Scratch 题目并启用 `judgeMode = static`。
- 粘贴只含 `staticChecks` 的 `judgeConfig`。
- 提交正确作品，Record 状态为 Accepted，分数满分。
- 提交缺少角色或变量的作品，Record 状态为 Wrong Answer，分数部分或 0。
- 提交列表显示自动分数。
- 预览页能看到自动测评详情。
- 老师仍可手动覆盖分数。
- 比赛/作业中提交后，成绩表同步更新。

### 动态判题验收

- 生产环境能 require 到 Scratch VM。
- `runtime_runs` 题能稳定通过。
- `variable_value` 绿旗题能稳定读取变量。
- `key_press` 题能稳定模拟按键。
- 超时作品不会卡住 Hydro 进程。
- 判题失败能给出可读错误。
- VM warning 不影响最终结果展示。

## 10. 最小可落地里程碑

### M1：静态自动测评闭环

范围：

```text
judgeConfig 保存
提交后调用静态 judge
自动回写 Hydro 分数
提交列表展示结果
手动评分保留
```

这是最稳的第一版。

### M2：测试点生成器接入

范围：

```text
支持老师粘贴 spec 或 judgeConfig
校验分值总和
错误提示
```

可以先作为命令行工具，不急着做复杂 UI。

### M3：动态变量判题

范围：

```text
runtime_runs
variable_value
green_flag / wait / key_press
```

只覆盖变量类行为题。

### M4：高级动态规则

后续再扩展：

```text
target_property
list_value
target_clone_count
sound_event
broadcast_event
mouse_action
set_target_property
```

## 11. 最终建议

落地时按以下顺序做：

1. 当前插件内新增 `judgeConfig` 保存能力。
2. 接入 `judge-worker` 的静态判题。
3. 用 `HydroApi.judge.end(...)` 统一回写结果。
4. 提交列表和预览页展示测试点详情。
5. 保留手动评分覆盖。
6. 静态闭环稳定后，再处理 Scratch VM 生产依赖并开放动态判题。

这条路线改动集中、风险可控，并且最大化复用当前插件已经完成的 Hydro 集成能力。
