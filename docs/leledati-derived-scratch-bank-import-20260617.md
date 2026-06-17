# Scratch 参考题型题库导入与测试报告（2026-06-17）

## 1. 执行范围

本次参考以下题库页面中的 Scratch 编程题型进行分析，并重新设计为可导入 Hydro Scratch 插件的题包：

- `https://www.leledati.com/index.php?learn-app-shijuan&subjectid=22`
- `https://www.leledati.com/index.php?learn-app-shijuan&subjectid=2`
- `https://www.leledati.com/index.php?learn-app-shijuan&subjectid=9`

处理原则：只参考题型、考点和常见出题结构，题面、变量名、测试点和任务描述均已重新整理，不直接搬运原题全文。

目标站点：`http://moran007.top/d/scratch/`

## 2. 本地生成文件

生成脚本：

- `scripts/generate_leledati_derived_bank.py`

生成目录：

- `generated/leledati-derived-scratch-bank-20260617/`

导入与校验记录：

- `generated/leledati-derived-scratch-bank-20260617/import-results/import-summary.json`
- `generated/leledati-derived-scratch-bank-20260617/import-results/import-summary.csv`
- `generated/leledati-derived-scratch-bank-20260617/import-results/student-access-summary.json`

本地包解析验证：12 个 `*.scratch-problem.zip` 均可被当前插件的 `readScratchProblemPackage` 正常读取。

## 3. 已导入题目

| 题号 | 类型 | 标题 | 配置页 | 答题页 |
| --- | --- | --- | --- | --- |
| `llscratcht01` | 任务题 | 星际航线定位 | `http://moran007.top/d/scratch/scratch/problem/llscratcht01/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht01/editor` |
| `llscratcht02` | 任务题 | 派对礼物变装 | `http://moran007.top/d/scratch/scratch/problem/llscratcht02/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht02/editor` |
| `llscratcht03` | 任务题 | 森林小鸟接力飞行 | `http://moran007.top/d/scratch/scratch/problem/llscratcht03/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht03/editor` |
| `llscratcht04` | 任务题 | 键盘赛车训练 | `http://moran007.top/d/scratch/scratch/problem/llscratcht04/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht04/editor` |
| `llscratcht05` | 任务题 | 画笔四宫格图案 | `http://moran007.top/d/scratch/scratch/problem/llscratcht05/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht05/editor` |
| `llscratcht06` | 任务题 | 克隆星星雨 | `http://moran007.top/d/scratch/scratch/problem/llscratcht06/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcht06/editor` |
| `llscratcha01` | 算法题 | 考试日期格式转换器 | `http://moran007.top/d/scratch/scratch/problem/llscratcha01/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha01/editor` |
| `llscratcha02` | 算法题 | 两位数 3 的倍数判定 | `http://moran007.top/d/scratch/scratch/problem/llscratcha02/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha02/editor` |
| `llscratcha03` | 算法题 | 藏头诗提取器 | `http://moran007.top/d/scratch/scratch/problem/llscratcha03/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha03/editor` |
| `llscratcha04` | 算法题 | 大苹果统计器 | `http://moran007.top/d/scratch/scratch/problem/llscratcha04/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha04/editor` |
| `llscratcha05` | 算法题 | 成绩等级播报器 | `http://moran007.top/d/scratch/scratch/problem/llscratcha05/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha05/editor` |
| `llscratcha06` | 算法题 | 列表筛选与重排 | `http://moran007.top/d/scratch/scratch/problem/llscratcha06/config` | `http://moran007.top/d/scratch/scratch/problem/llscratcha06/editor` |

## 4. 测试点概览

### 任务题

任务题使用 `staticChecks` / `structureChecks` 按任务点评分：

- `llscratcht01`：检查 `Player`、`Star`、`score`、绿旗、坐标定位、变量赋值、两段定位。
- `llscratcht02`：检查 `Gift`、`changeCount`、造型切换、等待、重复、变量增加。
- `llscratcht03`：检查 `Bird`、`Tree`、`steps`、三段滑行、说话输出。
- `llscratcht04`：检查 `Car`、`distance`、键盘事件、横向移动、条件判断、比较运算。
- `llscratcht05`：检查 `Painter`、`side`、画笔清空、落笔、移动、转向、重复。
- `llscratcht06`：检查 `Star`、`caught`、创建克隆、克隆启动、删除克隆、条件判断。

### 算法题

算法题使用 `algorithm.cases` 自动测评：

- `llscratcha01`：问答输入 + 角色说话输出，5 个日期转换测试点。
- `llscratcha02`：问答输入 + 角色说话输出，5 个两位数倍数判断测试点。
- `llscratcha03`：变量输出，检查变量 `藏头` 的最终值。
- `llscratcha04`：列表输入 `苹果重量` + 变量输出 `result`，5 个统计测试点。
- `llscratcha05`：问答输入 + 角色说话输出，5 个成绩等级测试点。
- `llscratcha06`：列表输入 `list` + 变量输出 `result`，5 个列表筛选与重排测试点。

`llscratcha06` 的样例规则与测试点：

- 输入 `[13, 15, 7, 12, 9, 17, 21, 5, 4, 19]`
- 输出 `9#12#21#19#4#5#17#7#15#13`

- 输入 `[5, 10, 48, 81, 50, 20, 85, 90, 60, 30]`
- 输出 `48#81#30#60#90#85#20#50#10#5`

## 5. 在线校验结果

管理员端：

- 12 个题包导入均返回 `HTTP/1.1 302 Found`，并跳转到对应配置页。
- 12 个配置页均返回 `HTTP/1.1 200 OK`。
- 12 个编辑器页均返回 `HTTP/1.1 200 OK`。
- 配置页中均能匹配到对应题目标题。

学生端抽测：

- `llscratcht01` 答题页：`HTTP/1.1 200 OK`
- `llscratcha01` 答题页：`HTTP/1.1 200 OK`
- `llscratcha04` 答题页：`HTTP/1.1 200 OK`
- `llscratcha06` 答题页：`HTTP/1.1 200 OK`

## 6. 注意事项

1. 连续快速上传题包时，站点偶发返回 curl `52 Empty reply from server`。本次导入通过 8 秒间隔和重试完成，题包本身没有损坏。
2. 为保证线上导入稳定，`llscratcha02` 暂未使用“同一测试点多次询问输入数组”，隐藏点改成普通边界输入。后续确认线上插件完全升级到支持多次询问数组后，可以重新加入该类测试点。
3. 列表算法题已保留数组输入，`llscratcha04` 与 `llscratcha06` 在线导入成功，说明当前线上环境支持列表输入类题包。
4. 本次只完成题目导入和页面可访问校验，没有替学生提交完整 Scratch 答案作品进行判题。
