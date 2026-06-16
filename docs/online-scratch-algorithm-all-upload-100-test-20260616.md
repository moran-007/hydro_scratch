# Scratch 算法题全量 ZIP 上传与 100 分提交测试报告

测试日期：2026-06-16
测试站点：`http://moran007.top/d/scratch/`
测试域：`scratch`
测试账号：admin=`yang`，student=`ceshi1`（密码、cookie 未写入本文档）

## 1. 测试目标

验证在 Scratch 域中，管理员可以将本地生成的 8 个算法题 ZIP 包全部导入线上；学生可以逐题上传对应 `.sb3` 答案；自动评测能够完成问答式输入输出判题，并为每道题返回 `Accepted` 和 `100/100`。

Scratch 算法题输入输出约定：

- 评测器将测试输入写入 Scratch 变量 `input`。
- 学生项目点击绿旗运行。
- 评测器读取 Scratch 变量 `output`。
- 按题目配置的比较方式进行判题：`number`、`trim` 或 `tokens`。

## 2. 本地材料

题目与答案目录：

`E:\Users\moran\Documents\hydro_chajian\docs\scratch-algorithm-packages-20260616`

生成脚本：

| 用途 | 文件 |
| --- | --- |
| 生成题目文档与测试点 | `scripts/generate_scratch_algorithm_test_doc.py` |
| 生成 8 个 Scratch 算法题 ZIP | `scripts/generate_scratch_algorithm_packages.py` |
| 生成 8 个 `.sb3` 答案文件 | `scripts/generate_scratch_algorithm_answers_sb3.py` |

本次上传的题目 ZIP：

| 本地题号 | ZIP 文件 | 测试点 |
| --- | --- | --- |
| SA01 | `codexsa01-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA02 | `codexsa02-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA03 | `codexsa03-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA04 | `codexsa04-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA05 | `codexsa05-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA06 | `codexsa06-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA07 | `codexsa07-20260616.scratch-problem.zip` | 5 个，每个 20 分 |
| SA08 | `codexsa08-20260616.scratch-problem.zip` | 5 个，每个 20 分 |

本次提交的答案文件：

| 本地题号 | 答案文件 |
| --- | --- |
| SA01 | `answer-sa01.sb3` |
| SA02 | `answer-sa02.sb3` |
| SA03 | `answer-sa03.sb3` |
| SA04 | `answer-sa04.sb3` |
| SA05 | `answer-sa05.sb3` |
| SA06 | `answer-sa06.sb3` |
| SA07 | `answer-sa07.sb3` |
| SA08 | `answer-sa08.sb3` |

说明：本次 `.sb3` 答案用于平台联调，按每题 5 个固定测试输入映射到期望输出，重点验证上传、配置解析、Scratch 运行、自动判题和记录同步链路。

## 3. 本地验证

8 个答案文件均通过本地 `validateScratchProject` 校验，并使用 `judgeScratchAlgorithmFile` 对对应题目配置完成自动评测。

| 本地题号 | 答案文件 | 本地结果 |
| --- | --- | --- |
| SA01 | `answer-sa01.sb3` | `100/100` |
| SA02 | `answer-sa02.sb3` | `100/100` |
| SA03 | `answer-sa03.sb3` | `100/100` |
| SA04 | `answer-sa04.sb3` | `100/100` |
| SA05 | `answer-sa05.sb3` | `100/100` |
| SA06 | `answer-sa06.sb3` | `100/100` |
| SA07 | `answer-sa07.sb3` | `100/100` |
| SA08 | `answer-sa08.sb3` | `100/100` |

本地验证结论：8/8 通过，合计 40/40 个测试点通过。

## 4. 线上导入结果

管理员账号登录后，通过 ZIP 导入接口上传 8 个题目包。每个导入请求均返回 `HTTP 302`，跳转到对应题目配置页。

| 本地题号 | 线上 PID | 题目地址 | 导入结果 |
| --- | --- | --- | --- |
| SA01 | `codexa01g616a` | `http://moran007.top/d/scratch/p/codexa01g616a` | `302` -> `/d/scratch/scratch/problem/codexa01g616a/config` |
| SA02 | `codexa02g616a` | `http://moran007.top/d/scratch/p/codexa02g616a` | `302` -> `/d/scratch/scratch/problem/codexa02g616a/config` |
| SA03 | `codexa03g616a` | `http://moran007.top/d/scratch/p/codexa03g616a` | `302` -> `/d/scratch/scratch/problem/codexa03g616a/config` |
| SA04 | `codexa04g616a` | `http://moran007.top/d/scratch/p/codexa04g616a` | `302` -> `/d/scratch/scratch/problem/codexa04g616a/config` |
| SA05 | `codexa05g616a` | `http://moran007.top/d/scratch/p/codexa05g616a` | `302` -> `/d/scratch/scratch/problem/codexa05g616a/config` |
| SA06 | `codexa06g616a` | `http://moran007.top/d/scratch/p/codexa06g616a` | `302` -> `/d/scratch/scratch/problem/codexa06g616a/config` |
| SA07 | `codexa07g616a` | `http://moran007.top/d/scratch/p/codexa07g616a` | `302` -> `/d/scratch/scratch/problem/codexa07g616a/config` |
| SA08 | `codexa08g616a` | `http://moran007.top/d/scratch/p/codexa08g616a` | `302` -> `/d/scratch/scratch/problem/codexa08g616a/config` |

## 5. 线上提交结果

学生账号 `ceshi1` 对 8 个线上题目分别上传对应 `.sb3` 答案。服务器返回 JSON 均为 `ok: true`，状态均为 `Accepted`，分数均为 `100/100`。

| 本地题号 | 线上 PID | 提交文件 | RID | 状态 | 分数 | 记录地址 |
| --- | --- | --- | --- | --- | --- | --- |
| SA01 | `codexa01g616a` | `answer-sa01.sb3` | `6a31523e1629ed38d81fb814` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb814` |
| SA02 | `codexa02g616a` | `answer-sa02.sb3` | `6a31523e1629ed38d81fb809` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb809` |
| SA03 | `codexa03g616a` | `answer-sa03.sb3` | `6a31523e1629ed38d81fb80b` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb80b` |
| SA04 | `codexa04g616a` | `answer-sa04.sb3` | `6a31523e1629ed38d81fb80c` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb80c` |
| SA05 | `codexa05g616a` | `answer-sa05.sb3` | `6a31523e1629ed38d81fb813` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb813` |
| SA06 | `codexa06g616a` | `answer-sa06.sb3` | `6a31523e1629ed38d81fb811` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb811` |
| SA07 | `codexa07g616a` | `answer-sa07.sb3` | `6a31523e1629ed38d81fb80e` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb80e` |
| SA08 | `codexa08g616a` | `answer-sa08.sb3` | `6a31523e1629ed38d81fb807` | `Accepted` | `100/100` | `http://moran007.top/d/scratch/record/6a31523e1629ed38d81fb807` |

线上提交结论：8/8 Accepted，合计 40/40 个测试点通过。

## 6. 题目覆盖范围

| 本地题号 | 题型 | 比较方式 | 覆盖点 |
| --- | --- | --- | --- |
| SA01 | 两数求和 | `number` | 正数、零、一正一负、进位、负数 |
| SA02 | 三数最大值 | `number` | 中间最大、全负、相等、后两项最大、第二项最大 |
| SA03 | 奇偶判断 | `trim` | 零、正奇数、负偶数、大奇数、大偶数 |
| SA04 | 1 到 n 求和 | `number` | 最小正数、小范围、10 项、零、100 项 |
| SA05 | 统计及格人数 | `number` | 边界 60、混合成绩、单人不及格、全及格、全不及格 |
| SA06 | 单词长度 | `number` | 短单词、Scratch、单字符、字母数字混合、长单词 |
| SA07 | 摄氏转华氏 | `number` | 冰点、沸点、相等点、体温附近、常温 |
| SA08 | 一组数最小值和最大值 | `tokens` | 普通序列、单数、全负、重复值、大范围 |

## 7. 结论

本次测试通过。

- 8 个本地 ZIP 题目均已成功上传到 `scratch` 域。
- 8 个线上题目均可接受学生上传 `.sb3` 提交。
- 自动评测均完成 Scratch 问答式输入输出判题。
- 每题 5 个测试点全部通过。
- 最终线上结果为 8/8 `Accepted`，8/8 `100/100`。

## 8. 注意事项

- 本次线上请求使用 HTTP 地址完成；此前本机 `curl` 环境访问 HTTPS 时出现 TLS 握手问题。
- 临时登录 cookie 已用于测试流程，不写入仓库文档。
- 本文档不保存任何账号密码。
