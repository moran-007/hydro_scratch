# Scratch 题目包导入导出与多测试点自动测评线上测试

测试日期：2026-05-28  
测试站点：http://moran007.top  
线上观测插件版本：`0.5.0`（`scratch-editor/index.html` 显示 `gui.js?v=0.5.0`）  
本地修复后版本：`0.5.2`  

> 说明：本次测试使用用户提供的管理员账号和学生账号完成，但本文档不记录账号密码。

## 1. 测试结论

本次测试完成了以下验证：

- 管理员可以访问 `/scratch/problem/import` 导入页。
- 使用 Hydro 原生 Scratch 题目包上传导入时，线上 `0.5.0` 返回 500，错误为 `domainId.toLowerCase is not a function`。
- 该问题已在本地 `0.5.2` 修复：导入接口改为从 `this.args.domainId` 读取域 ID。
- 同时发现线上动态判题依赖缺失：`scratch-vm` 启动时报 `Cannot find module 'scratch-render-fonts'`。
- 该问题已在本地 `0.5.2` 修复：显式加入生产依赖 `scratch-render-fonts`。
- 为继续验证题目内容、导出和自动测评，已在线上通过普通 Scratch 出题入口创建同等中文题面、多测试点题目。
- 线上创建题目后，导出 `.scratch-problem.zip` 成功，导出包可被本地解析，包含 17 个测试点。
- 学生提交满分样例时，静态和结构测试点全部通过，动态测试点因服务器依赖缺失全部失败，线上得分 `76 / 100`。
- 学生提交失败样例时，线上得分 `31 / 100`，失败点符合预期方向。

## 2. 修复包

已生成修复包：

```text
release/hydro-plugin-scratch-0.5.2.tgz
release/hydro-plugin-scratch-update-0.5.2.zip
release/hydro-plugin-scratch-update-0.5.2.tgz
```

服务器推荐更新命令：

```bash
tar -xzf /chajian/hydro-plugin-scratch-update-0.5.2.tgz -C /root/.hydro/addons/hydro-plugin-scratch --strip-components=1
cd /root/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果不用 `pm2`，最后一步替换为当前 Hydro 的实际重启方式。

## 3. 导入测试

测试题目包：

```text
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\scratchpkg0528071429.scratch-problem.zip
```

导入入口：

```text
http://moran007.top/scratch/problem/import
```

实际结果：

| 项目 | 结果 |
| --- | --- |
| 导入页访问 | 成功 |
| 上传题目包 | 失败 |
| HTTP 状态 | `500` |
| 错误关键词 | `domainId.toLowerCase is not a function` |
| 根因 | `ScratchProblemImportHandler.post(domainId)` 在无 `@post` 参数装饰器时拿到的是 args 对象，不是字符串域 ID |
| 修复版本 | `0.5.2` |

原始结果：

```text
release/online-import-failure-scratchpkg0528071429.json
```

## 4. 线上创建的自动测试题目

由于线上 `0.5.0` 导入接口存在上述问题，本次继续通过普通 Scratch 出题入口创建同等题目，用于验证题面、测试点、导出和提交测评。

题目 ID：

```text
scratchweb0528071429
```

题目地址：

```text
http://moran007.top/p/scratchweb0528071429
```

配置地址：

```text
http://moran007.top/scratch/problem/scratchweb0528071429/config
```

导出地址：

```text
http://moran007.top/scratch/problem/scratchweb0528071429/export
```

提交列表：

```text
http://moran007.top/scratch/problem/scratchweb0528071429/submissions
```

题面中文检测：通过。页面包含 `Scratch 中文导入导出自动测评` 和 `请完成一段角色移动程序`。

## 5. 中文题面内容

题目要求：

1. 保留 `Player` 角色和 `Goal` 目标角色。
2. 创建或保留变量 `score`。
3. 在 `Player` 角色的绿旗脚本中，先把 `score` 设为 `0`。
4. 让 `Player` 先移动到 `x=-120, y=-20`。
5. 再连续移动两段：第一段 `150` 步，第二段 `70` 步。
6. 到达终点后把 `score` 设置为 `100`。
7. 最终 `Player` 应接近 `x=100, y=-20`。

## 6. 测试点配置

判题模式：`Hybrid`  
总分：`100`  
测试点数量：`17`

| 分类 | 测试点 | 类型 | 分值 |
| --- | --- | --- | ---: |
| static | 存在 Player 角色 | `sprite_exists` | 5 |
| static | 存在 Goal 目标角色 | `sprite_exists` | 5 |
| static | 存在 score 变量 | `variable_exists` | 5 |
| static | 使用设置变量积木 | `block_exists` | 5 |
| static | 至少使用两次移动步数 | `min_block_count` | 5 |
| static | 没有使用无限循环 | `forbidden_block_absent` | 5 |
| structure | Player 上有绿旗脚本 | `target_script_exists` | 6 |
| structure | 主脚本顺序符合要求 | `script_sequence` | 10 |
| structure | 主脚本包含移动与变量模块 | `script_module` | 5 |
| structure | 起点坐标正确 | `block_input_equals` | 8 |
| structure | 第一段移动 150 步 | `block_input_equals` | 5 |
| structure | 第二段移动 70 步 | `block_input_equals` | 5 |
| structure | 结束时把 score 设为 100 | `block_input_equals` | 4 |
| structure | 设置的是 score 变量 | `block_field_equals` | 3 |
| dynamic | 运行时可以正常执行 | `runtime_runs` | 4 |
| dynamic | Player 到达终点坐标 | `sprite_position` | 10 |
| dynamic | score 最终等于 100 | `variable_value` | 10 |

## 7. 本地预检结果

在本地 `0.5.2` 代码与完整依赖环境下，同一题目包和同一提交样例的预检结果：

| 样例 | 结果 | 得分 | 通过测试点 |
| --- | --- | ---: | --- |
| 满分样例 | 通过 | `100 / 100` | `17 / 17` |
| 失败样例 | 不通过 | `35 / 100` | `7 / 17` |

本地预检证明：题目包、测试点配置和 `.sb3` 样例本身是可用的。

## 8. 导出测试

线上题目导出成功。

| 项目 | 结果 |
| --- | --- |
| HTTP 状态 | `200` |
| Content-Type | `application/zip` |
| 导出包大小 | `2468` bytes |
| 本地解析导出包 | 成功 |
| 导出包题面中文检测 | 通过 |
| 导出包测试点数量 | `17` |
| 导出包模板文件 | 无；该线上题目通过普通创建入口创建，未上传模板 |

导出包路径：

```text
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\scratchweb0528071429-exported.zip
```

## 9. 学生提交测试

### 9.1 满分样例

样例核心脚本：

```text
Player:
event_whenflagclicked
-> data_setvariableto score = 0
-> motion_gotoxy X=-120 Y=-20
-> motion_movesteps STEPS=150
-> motion_movesteps STEPS=70
-> data_setvariableto score = 100
```

预期：`100 / 100`，`Accepted`。

线上实际：

| 项目 | 结果 |
| --- | --- |
| RID | `6a17ecee26d6f37c51253adf` |
| 状态 | `Wrong Answer` |
| 得分 | `76 / 100` |
| 通过测试点 | `14 / 17` |

失败原因：

```text
Scratch VM is unavailable: Cannot find module 'scratch-render-fonts'
```

静态与结构测试点全部通过，丢失的 24 分全部来自动态测试点。

### 9.2 失败样例

样例核心脚本：

```text
Player:
event_whenflagclicked
-> data_setvariableto score = 0
-> motion_movesteps STEPS=20
```

预期：静态部分部分通过，结构与动态大部分失败。

线上实际：

| 项目 | 结果 |
| --- | --- |
| RID | `6a17ecf026d6f37c51253ae5` |
| 状态 | `Wrong Answer` |
| 得分 | `31 / 100` |
| 通过测试点 | `6 / 17` |

失败样例结果符合预期方向；动态测试点同样因为服务器依赖缺失全部失败。

## 10. 本次发现的问题与处理

### 问题 1：导入接口 500

线上表现：

```text
domainId.toLowerCase is not a function
```

影响：

- `/scratch/problem/import` 无法完成题目包导入。
- 无法在线上完成“导入 -> 导出 -> 再导入”的完整闭环。

处理：

- 已在 `0.5.2` 修复。
- 修复点：导入接口从 `this.args.domainId` 读取域 ID，不再依赖无装饰器方法形参。

### 问题 2：动态判题缺少生产依赖

线上表现：

```text
Cannot find module 'scratch-render-fonts'
```

影响：

- `runtime_runs` 失败。
- `sprite_position` 失败。
- `variable_value` 失败。
- 满分样例只能拿到静态和结构分，线上为 `76 / 100`。

处理：

- 已在 `0.5.2` 将 `scratch-render-fonts` 加入 `dependencies`。
- 更新后必须执行 `yarn --production`，否则新依赖不会出现在服务器 `node_modules` 中。

## 11. 原始数据

本次测试原始 JSON：

```text
release/online-import-failure-scratchpkg0528071429.json
release/online-create-export-test-scratchweb0528071429.json
```

生成的本地样例与题目包：

```text
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\scratchpkg0528071429.scratch-problem.zip
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\passing.sb3
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\failing.sb3
C:\Users\moran\AppData\Local\Temp\scratch-package-online-n1ecR8\template.sb3
```

## 12. 复测建议

部署 `0.5.2` 后，建议按以下顺序复测：

1. 打开 `/scratch/problem/import` 上传同一个题目包。
2. 确认导入后题面为中文，测试点数量为 17。
3. 点击导出，确认 `.scratch-problem.zip` 可下载。
4. 使用导出包再次导入为新题。
5. 用学生账号提交满分样例，预期 `100 / 100 Accepted`。
6. 用学生账号提交失败样例，预期 `35 / 100 Wrong Answer` 左右。
