# Codex 交接文档：Scratch 插件 0.6.13

更新时间：2026-06-16

## 当前目标

本轮主要目标是降低老师创建和修改 Scratch 题目的配置成本，让任务题、算法题、手动评分、自动评分、混合评分都能在更少页面跳转内完成，并补充算法题自动测评测试。

## 当前版本

- 插件版本：`0.6.13`
- 主分支：`main`
- GitHub 远端：`https://github.com/moran-007/hydro_scratch.git`
- 推荐生产覆盖包：`release/hydro-plugin-scratch-update-0.6.13.tgz`
- Windows 覆盖包：`release/hydro-plugin-scratch-update-0.6.13.zip`
- 完整安装包：`release/hydro-plugin-scratch-0.6.13.tgz`

## 已完成内容

### 一站式创建题目

- `templates/scratch_problem_create.html` 已改为一站式表单。
- 创建页现在可直接设置：
  - 标题、题号、题面、隐藏状态。
  - 题目类型：任务题、算法题。
  - 提交方式：上传、在线编辑器、两者都允许。
  - 测评方式：手动评分、静态检查、动态运行、混合测评。
  - 满分、模板下载权限。
  - 算法题测试点快捷录入。
  - 高级自动测评 JSON。
  - 作品文件限制和禁用扩展。
- 创建成功后跳转到编辑页，方便继续上传模板作品或微调配置。

### 后端创建保存逻辑

相关文件：`src/http.ts`

- 新增 `scratchCreateDefaultConfig()`，为创建题目构造完整 Scratch 默认配置。
- 新增 `normalizeCreateConfigBody()`，让创建页和编辑/配置页复用同一套 `buildScratchConfigPatch()` 保存逻辑。
- 创建题目时不再只保存 `problemKind`，而是保存完整配置。
- 创建页若选择算法题，会按动态测评默认逻辑初始化；表单中显式提交的 `judgeMode` 会覆盖默认值。

### 编辑页和配置页减少跳转

相关文件：

- `templates/scratch_problem_edit.html`
- `templates/scratch_problem_config.html`

完成内容：

- 题目类型说明从“切换后保存一次”改为“本页可直接调整”。
- 算法题测试点快速录入区始终存在，可折叠展开。
- 当选择算法题时，测试点区自动展开。
- 当选择算法题且测评方式仍为手动评分时，页面会建议切到动态运行。
- 增加评分方式提示卡，帮助老师快速理解手动、自动、算法题配置。

### 算法题测试覆盖

新增文件：`test/algorithm-judge.test.ts`

覆盖内容：

- 10 个输入输出测试点。
- 单值输入。
- 单行多个输入。
- `\n` 多行输入。
- JSON 数组形式的数字列表输入。
- JSON 数组形式的字符串列表输入。
- 布尔输入。
- `number` 数字误差比较。
- `tokens` 分词比较。
- 隐藏失败测试点。
- 得分累计判定。
- 输出列表读取。
- 总分缩放。

更新文件：`test/problem-config.test.ts`

覆盖内容：

- 创建题目时保存完整算法题配置。
- 创建页快捷录入 10 个测试点并写入 `judgeConfig.algorithm.cases`。
- 创建后跳转编辑页。

## 已验证

本地已执行：

```bash
npm run check
```

结果：

```text
TypeScript build passed.
Vitest: 5 test files passed, 34 tests passed.
```

打包时 `npm run pack:plugin` 也会重新执行 `npm run check`，本轮已通过。

## 生产部署命令

如果服务器已经安装过完整插件，并且本地有原始备份，可直接覆盖：

```bash
tar -xzf /chajian/hydro-plugin-scratch-update-0.6.13.tgz -C /root/.hydro/addons/hydro-plugin-scratch --strip-components=1
cd /root/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果 Hydro 不是 pm2 部署，请改用实际重启命令。

## 线上测试建议

测试域通常为 `/d/scratch/`。账号密码不要写入仓库；如需线上测试，请让用户在当前对话中重新提供。

建议验收：

1. 管理员进入 Scratch 域，创建 Scratch 题目。
2. 在创建页直接选择算法题、动态运行或混合测评。
3. 录入 1 到 10 个算法测试点，包含多行输入和列表输入。
4. 创建后进入编辑页，确认测试点仍在。
5. 上传或使用在线编辑器完成作品提交。
6. 检查测评记录、题目状态、比赛/作业/训练上下文成绩。
7. 创建任务题，验证手动评分仍进入待处理队列。
8. 进入 `/scratch/review`，确认待处理记录可跨题查询。

## 当前 Git 注意事项

本轮应纳入提交的新增文件：

- `docs/codex-handoff-0.6.13.md`
- `docs/templates/judge-config-algorithm-io.json`
- `src/algorithm-judge.ts`
- `templates/partials/`
- `test/algorithm-judge.test.ts`
- `test/domain-scope.test.ts`

本轮不建议纳入提交的未跟踪目录：

- `.arts/`
- `hydro-plugin-points/`
- `points-system-doc/`

这些目录看起来不是当前 Scratch 自动测评插件的一部分，提交前需要再次确认。

## 后续可继续优化

- 在创建页增加更强的“任务题配置向导”，用表单生成常见 `staticChecks`、`structureChecks`、`dynamicChecks`。
- 算法题快捷录入可以继续增加 CSV/表格批量粘贴模式。
- 自动测评报告可进一步区分“学生可见信息”和“老师可见调试信息”。
- 如果线上 Scratch VM 动态运行耗时较长，可增加题目级并发限制和超时说明。
- 继续检查 Hydro 不同比赛规则下的分数展示，确保与 Hydro 原生行为一致。

