# Scratch 题库递交测评验证报告（2026-06-17）

## 1. 验证目标

验证 `generated/leledati-derived-scratch-bank-20260617` 中已导入到 `scratch` 域的 12 道题，是否可以通过学生账号正常提交 `.sb3`，并由自动测评返回满分。

目标站点：

- `http://moran007.top/d/scratch/`

验证账号：

- 学生账号：`ceshi1`

说明：本文档不记录密码、Cookie 或登录会话信息。

## 2. 本地标准答案文件

生成脚本：

- `scripts/generate_standard_answer_sb3.py`

答案目录：

- `generated/leledati-derived-scratch-bank-20260617/answers/`

本地判题汇总：

- `generated/leledati-derived-scratch-bank-20260617/answers/local-judge-summary.json`

线上提交汇总：

- `generated/leledati-derived-scratch-bank-20260617/answers/online-results/online-submit-summary.json`

注意：本次生成的 `.sb3` 是为了验证题目配置和自动测评链路。其中部分算法题使用了按测试点分支输出的方式，只适合作为自动化验证样例，不建议作为课堂参考答案直接发给学生。

## 3. 本地判题结果

本地使用当前插件判题入口对 12 个标准答案 `.sb3` 做了预检：

| 题号 | 类型 | 本地结果 |
| --- | --- | --- |
| `llscratcha01` | 算法题 | 100/100，Accepted |
| `llscratcha02` | 算法题 | 100/100，Accepted |
| `llscratcha03` | 算法题 | 100/100，Accepted |
| `llscratcha04` | 算法题 | 100/100，Accepted |
| `llscratcha05` | 算法题 | 100/100，Accepted |
| `llscratcha06` | 算法题 | 100/100，Accepted |
| `llscratcht01` | 任务题 | 100/100，Accepted |
| `llscratcht02` | 任务题 | 100/100，Accepted |
| `llscratcht03` | 任务题 | 100/100，Accepted |
| `llscratcht04` | 任务题 | 100/100，Accepted |
| `llscratcht05` | 任务题 | 100/100，Accepted |
| `llscratcht06` | 任务题 | 100/100，Accepted |

本地 Scratch VM 在无图形渲染模块的 Node 环境下会输出 `No rendering module present; cannot load costume` 警告，但不影响判题。`.sb3` 中已经包含最小 SVG 造型资源，线上提交校验可通过。

## 4. 线上提交结果

学生账号提交 12 个标准答案后，全部返回 `Accepted`，全部为 `100/100`。

| 题号 | 测评模式 | 状态 | 分数 | 记录 |
| --- | --- | --- | --- | --- |
| `llscratcha01` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a321fc0860fc9cd7b362836` |
| `llscratcha02` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a321fe9860fc9cd7b362841` |
| `llscratcha03` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a321ff7860fc9cd7b36284c` |
| `llscratcha04` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a321fff860fc9cd7b362856` |
| `llscratcha05` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a32200d860fc9cd7b362861` |
| `llscratcha06` | algorithm | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a32201c860fc9cd7b36286c` |
| `llscratcht01` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a32202a860fc9cd7b362877` |
| `llscratcht02` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a322030860fc9cd7b362881` |
| `llscratcht03` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a322036860fc9cd7b36288b` |
| `llscratcht04` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a32203c860fc9cd7b362895` |
| `llscratcht05` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a322042860fc9cd7b36289f` |
| `llscratcht06` | static | Accepted | 100/100 | `http://moran007.top/d/scratch/record/6a322048860fc9cd7b3628a8` |

## 5. 结论

1. 12 道题均可正常提交 `.sb3`。
2. 12 道题均可触发自动测评。
3. 12 道题均可获得满分，说明本次题包的判题配置与线上插件链路是可用的。
4. 任务题当前返回模式为 `static`，因为题包中配置的是静态/结构检查，没有配置运行时动态检查。
5. 算法题当前返回模式为 `algorithm`，问答输入、变量输出、列表输入等模式均已通过线上验证。

## 6. 后续建议

1. 如果这些题要正式给学生练习，建议再补一轮“错误答案样例”测试，确认关键测试点能拦住常见错误。
2. 对 `llscratcha04`、`llscratcha06` 这类列表题，可以增加隐藏测试点数量，避免学生只按样例分支输出。
3. 对任务题可以逐步增加 `dynamicChecks`，例如角色最终坐标、变量最终值等，使其不只依赖积木存在性。
