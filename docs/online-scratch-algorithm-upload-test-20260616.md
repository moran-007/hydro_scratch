# Scratch 算法题在线创建、ZIP 导入与提交测试报告

测试日期：2026-06-16
测试站点：`http://moran007.top/d/scratch/`
测试域：`scratch`
测试账号：admin=`yang`，student=`ceshi1`（密码未写入本文档）

## 1. 测试目标

验证 Scratch 域中的算法题功能闭环：

- 管理员可在线创建算法题，并在创建页直接录入输入输出测试点。
- 管理员可导入本地生成的 Scratch 算法题 ZIP 包。
- 学生可上传 `.sb3` 作品提交。
- 自动评测可按 `input` / `output` 变量完成问答式输入输出判断，并把结果同步到 Hydro 评测记录。

## 2. 本地测试材料

本地生成目录：

`E:\Users\moran\Documents\hydro_chajian\docs\scratch-algorithm-packages-20260616`

已生成 8 个题目 ZIP 包：

| PID | 文件 |
| --- | --- |
| codexsa01 | `codexsa01-20260616.scratch-problem.zip` |
| codexsa02 | `codexsa02-20260616.scratch-problem.zip` |
| codexsa03 | `codexsa03-20260616.scratch-problem.zip` |
| codexsa04 | `codexsa04-20260616.scratch-problem.zip` |
| codexsa05 | `codexsa05-20260616.scratch-problem.zip` |
| codexsa06 | `codexsa06-20260616.scratch-problem.zip` |
| codexsa07 | `codexsa07-20260616.scratch-problem.zip` |
| codexsa08 | `codexsa08-20260616.scratch-problem.zip` |

每个 ZIP 根目录均包含：

- `problem.yaml`
- `statement.md`
- `scratch-judge.json`

本次线上提交使用答案工程：

`E:\Users\moran\Documents\hydro_chajian\docs\scratch-algorithm-packages-20260616\answer-sa03-even-odd.sb3`

答案工程说明：

- 目标题目：SA03 奇偶判断
- Scratch 变量：`input`、`output`
- 运行方式：点击绿旗后读取 `input`，偶数写入 `even`，奇数写入 `odd`
- 本地校验：`validateScratchProject` 通过，`judgeScratchAlgorithmFile` 得分 `100/100`

## 3. 本地 ZIP 包校验

本地包已经用插件读取逻辑校验：

- 8/8 个 ZIP 可被 `readScratchProblemPackage` 读取。
- 8/8 个 ZIP 均为算法题配置。
- 8/8 个 ZIP 均为动态测评配置。
- 每题包含 5 个测试点。

SA03 本地答案评测结果：

| 测试点 | 输入 | 期望输出 | 实际输出 | 得分 |
| --- | --- | --- | --- | --- |
| 公开 1：零 | `0` | `even` | `even` | 20/20 |
| 公开 2：正奇数 | `7` | `odd` | `odd` | 20/20 |
| 公开 3：负偶数 | `-4` | `even` | `even` | 20/20 |
| 隐藏 1：较大奇数 | `101` | `odd` | 通过 | 20/20 |
| 隐藏 2：较大偶数 | `1000` | `even` | 通过 | 20/20 |

总分：`100/100`

## 4. 在线创建题目测试

创建方式：管理员在 Scratch 创建接口提交表单，使用快速算法测试点录入。

线上题目：

- 题号：`P59628`
- 标题：`Codex测试20260616-SA03-奇偶判断-在线创建`
- 题目地址：`http://moran007.top/d/scratch/p/P59628`
- 配置地址：`http://moran007.top/d/scratch/scratch/problem/P59628/config`

配置核验：

| 项目 | 结果 |
| --- | --- |
| 题目类型 | 算法题 |
| 提交方式 | 上传和在线编辑器都允许 |
| 测评方式 | 动态运行 |
| 满分 | 100 |
| 输入变量 | `input` |
| 输出变量 | `output` |
| 比较方式 | `trim` |
| 测试点 | 5 个，含 3 个公开点和 2 个隐藏点 |

学生提交结果：

- 学生账号：`ceshi1`
- 上传文件：`answer-sa03-even-odd.sb3`
- 记录 RID：`6a314f401629ed38d81fb7d8`
- 记录地址：`http://moran007.top/d/scratch/record/6a314f401629ed38d81fb7d8`
- 状态：`Accepted`
- 分数：`100/100`

Hydro 题目详情页同步结果：

- 尝试：1
- 已通过：1

## 5. ZIP 导入题目测试

导入方式：管理员上传本地 ZIP 包 `codexsa03-20260616.scratch-problem.zip`，并覆盖导入 PID 为 `codexzip16212512`。

线上题目：

- 题号：`codexzip16212512`
- 标题：`Codex测试-20260616-SA03-奇偶判断`
- 题目地址：`http://moran007.top/d/scratch/p/codexzip16212512`
- 配置地址：`http://moran007.top/d/scratch/scratch/problem/codexzip16212512/config`

配置核验：

| 项目 | 结果 |
| --- | --- |
| 题目类型 | 算法题 |
| 提交方式 | 上传和在线编辑器都允许 |
| 测评方式 | 动态运行 |
| 满分 | 100 |
| 输入变量 | `input` |
| 输出变量 | `output` |
| 比较方式 | `trim` |
| 测试点 | 5 个，含 3 个公开点和 2 个隐藏点 |

学生提交结果：

- 学生账号：`ceshi1`
- 上传文件：`answer-sa03-even-odd.sb3`
- 记录 RID：`6a314f531629ed38d81fb7e2`
- 记录地址：`http://moran007.top/d/scratch/record/6a314f531629ed38d81fb7e2`
- 状态：`Accepted`
- 分数：`100/100`

## 6. 线上评测明细

两次线上提交的自动评测明细一致：

| 测试点 | 输入 | 期望输出 | 实际输出 | 状态 | 得分 |
| --- | --- | --- | --- | --- | --- |
| 公开 1：零 | `0` | `even` | `even` | Accepted | 20/20 |
| 公开 2：正奇数 | `7` | `odd` | `odd` | Accepted | 20/20 |
| 公开 3：负偶数 | `-4` | `even` | `even` | Accepted | 20/20 |
| 隐藏 1：较大奇数 | `101` | `odd` | 隐藏 | Accepted | 20/20 |
| 隐藏 2：较大偶数 | `1000` | `even` | 隐藏 | Accepted | 20/20 |

自动评测汇总：

- 通过测试点：5/5
- 原始得分：100/100
- 最终状态：Accepted

## 7. 结论

本次测试通过。

Scratch 域已验证以下能力可用：

- 管理员在线创建算法题，并通过快速录入生成算法测试配置。
- 管理员通过 ZIP 包导入本地生成题目和配置。
- 学生通过上传 `.sb3` 方式提交答案。
- 自动评测能将测试输入写入 Scratch 变量 `input`，运行绿旗后读取变量 `output`，并完成公开与隐藏测试点评分。
- 评测结果可同步到 Hydro 记录页，状态为 Accepted，分数为 100。

## 8. 注意事项

- 本次线上请求使用 HTTP 地址完成；测试中 HTTPS 连接在本机 `curl` 环境下出现 TLS 握手问题。
- PowerShell 中 `$PID` 是只读系统变量。在线创建题原计划使用自定义 PID，但变量名冲突导致表单提交时 PID 为空，Hydro 自动生成了题号 `P59628`。这不影响在线创建功能验证。
- 文档未保存任何账号密码、cookie 或会话信息。
