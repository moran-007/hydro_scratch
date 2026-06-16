# Hydro Scratch 自动测评插件

当前版本：`0.6.13`

这是一个面向 HydroOJ 的 Scratch 出题、答题、暂存、提交、批改和自动测评插件。插件会创建 Hydro 原生题目，同时为题目增加 Scratch 在线编辑器、`.sb3` 上传、草稿恢复、手动评分、静态/动态/混合自动测评、算法题输入输出测试和题目包导入导出能力。

## 主要功能

- 在 Hydro 题库中创建普通题目，并自动打上 `Scratch` 标签。
- 支持管理员限制插件只在指定域生效，例如只在 `/d/scratch/` 中显示创建入口和答题入口。
- 学生可以在网页内打开内嵌 Scratch 编辑器完成作品、保存草稿、恢复草稿并提交测评。
- 老师可以上传模板作品、查看提交、预览作品、下载 `.sb3`、手动评分或覆盖自动评分结果。
- 支持域级待批改队列 `/scratch/review`，老师不需要先进入具体题目即可查看待处理提交。
- 支持任务题和算法题两类题目。
- 任务题支持静态检查、积木结构顺序检查、动态运行检查和混合测评。
- 算法题支持批量输入输出测试，默认向 Scratch 变量 `input` 写入输入，运行绿旗后读取 `output` 判分。
- 算法题支持 `exact`、`trim`、`tokens`、`number` 四种输出比较方式，支持隐藏测试点、列表输入和列表输出。
- 创建页、编辑页和配置页均可直接调整手动评分、自动评分、混合评分、算法测试点和作品限制，减少反复跳转。
- 自动测评结果会写回 Hydro 记录，并同步普通练习、比赛、作业等上下文成绩。
- 支持 Hydro 原生风格题目包导入导出，包含题面、Scratch 配置、测评配置和可选模板 `.sb3`。
- 自带 Scratch GUI 静态资源和 Scratch 素材代理，适合离线或内网部署。

## 安装开发版

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

安装后重启 Hydro。

## 生产部署

完整安装包：

```text
release/hydro-plugin-scratch-0.6.13.tgz
```

已有插件时优先使用轻量覆盖更新包：

```text
release/hydro-plugin-scratch-update-0.6.13.tgz
release/hydro-plugin-scratch-update-0.6.13.zip
```

Linux 覆盖更新示例：

```bash
tar -xzf /tmp/hydro-plugin-scratch-update-0.6.13.tgz -C ~/.hydro/addons/hydro-plugin-scratch --strip-components=1
cd ~/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果不是 `pm2` 部署，请使用你的实际 Hydro 重启方式。更完整的部署说明见 [DEPLOY.md](DEPLOY.md)。

## 域作用范围

系统管理员可以在插件配置中限制插件生效的 Hydro 域：

```yaml
enabledDomains:
  - scratch
  - classroom
```

说明：

- 域 ID 来自 URL，例如 `http://moran007.top/d/scratch/` 对应 `scratch`。
- `enabledDomains` 为空时保持旧行为，即所有域都启用插件。
- 未启用的域会隐藏 Scratch 创建入口和题面操作入口，直接访问插件路由会返回未找到。
- 从启用列表移除某个域不会删除已有 Scratch 题目、提交、草稿或存储文件。
- `/scratch-assets` 是编辑器共享静态资源，仍保持全局可访问。

域配置说明见 [docs/scratch-domain-scope-0.6.8.md](docs/scratch-domain-scope-0.6.8.md)。

## 创建题目

进入启用域后，使用 Scratch 题目创建入口。`0.6.13` 起创建页已经是一站式配置页，可以在创建时直接设置：

- 题目标题、题号、题面、隐藏状态。
- 题目类型：任务题或算法题。
- 提交方式：仅上传、仅在线编辑器、上传和在线编辑器都允许。
- 测评方式：手动评分、静态检查、动态运行、混合测评。
- 满分和是否允许学生下载模板。
- 算法题输入输出测试点快捷录入。
- 高级自动测评 JSON。
- `.sb3` 文件大小、解压大小、素材数量和禁用扩展等限制。

创建成功后会进入编辑页，方便继续上传模板作品或微调测试点。

## 任务题测评

任务题适合 Scratch 编程闯关、角色移动、变量结果、积木顺序等场景。

常用配置：

- `staticChecks`：检查角色、变量、积木、广播、舞台等是否存在。
- `structureChecks`：检查指定角色脚本中积木是否按要求顺序出现。
- `dynamicChecks`：运行 Scratch VM 后检查角色位置、变量值、列表值等结果。
- `hybrid`：同时执行静态、结构和动态检查，按任务点累计得分。

老师可以下载配置模板和说明：

- [docs/teacher-judge-config-guide.md](docs/teacher-judge-config-guide.md)
- [docs/templates/judge-config-static-structure-only.json](docs/templates/judge-config-static-structure-only.json)
- [docs/templates/judge-config-hybrid-position.json](docs/templates/judge-config-hybrid-position.json)
- [docs/templates/judge-config-keypress-variable.json](docs/templates/judge-config-keypress-variable.json)

## 算法题测评

算法题适合“输入一组数据，输出答案”的 Scratch 题目。默认规则：

- 判题器向变量 `input` 写入当前测试点输入。
- 运行绿旗。
- 等待指定毫秒数。
- 读取变量 `output`。
- 按配置的比较方式判定是否通过并累计分数。

快捷录入格式：

```text
输入 => 期望输出 => 分值 => 名称
```

示例：

```text
1 => 1 => 5 => 单值输入
1 2 => 3 => 5 => 单行多个输入
2\n3 => 5 => 10 => 多次输入
[1,2,3] => 6 => 10 => 列表数字输入
["a","b"] => a b => 10 => 列表字符串输入
* 100 200 => 300 => 20 => 隐藏大数据
```

说明：

- 多行输入写成 `\n`。
- JSON 数组会作为列表值解析，例如 `[1,2,3]`。
- 行首加 `*` 表示隐藏测试点，失败时不向学生暴露实际输入输出。
- `exact` 要求完全一致。
- `trim` 忽略首尾空白。
- `tokens` 按空白分词比较。
- `number` 按数字比较，可配置误差。

算法题模板见 [docs/templates/judge-config-algorithm-io.json](docs/templates/judge-config-algorithm-io.json)。

## 题目包导入导出

插件支持 Hydro 原生风格 Scratch 题目包：

```text
problem.yaml
statement.md
scratch-judge.json
template.sb3          # 可选
```

用途：

- 老师可以把配置好的题目导出为 `.scratch-problem.zip`。
- 其他 Hydro 站点可以通过导入页创建同样的题目。
- 导入导出会保留题面、标签、隐藏状态、Scratch 配置、自动测评配置和模板作品。

说明见 [docs/hydro-native-problem-package.md](docs/hydro-native-problem-package.md)。

## 常用路由

```text
GET  /scratch/problem/create
GET  /scratch/problem/import
POST /scratch/problem/import
GET  /scratch/problem/:pid/edit
GET  /scratch/problem/:pid/config
POST /scratch/problem/:pid/config
GET  /scratch/problem/:pid/export
GET  /scratch/problem/:pid/editor
GET  /scratch/problem/:pid/submissions
GET  /scratch/review
GET  /scratch/problem/:pid/draft
POST /scratch/problem/:pid/draft
GET  /scratch/problem/:pid/draft/project
POST /scratch/submit/:pid
GET  /scratch/submission/:rid/preview
GET  /scratch/submission/:rid/project
GET  /scratch/submission/:rid/report
GET  /scratch/submission/:rid/score
POST /scratch/submission/:rid/score
```

## 开发与测试

```bash
npm run build
npm test
npm run check
```

打包：

```bash
npm run pack:plugin
```

当前版本本地验证：

- TypeScript 编译通过。
- Vitest 全量通过：5 个测试文件，34 个测试。
- 算法题新增覆盖：10 个测试点、多行输入、列表输入、列表输出、输出比较、隐藏失败点、得分累加和总分缩放。

## 升级注意事项

- 动态测评依赖 `scratch-vm` 和 `scratch-render-fonts`，生产服务器覆盖更新后请执行 `yarn --production`。
- 如果浏览器仍加载旧 Scratch GUI，请清理浏览器缓存或用无痕窗口验证。
- 比赛场景的分数展示遵循 Hydro 比赛规则：全对显示 AC，非全对是否显示具体分数由比赛类型决定。
- 不建议把线上账号密码写入仓库；需要线上测试时请在当前工作线程中临时提供。

## 交接文档

如果后续切换 Codex 账号或新线程继续开发，请先阅读：

- [docs/codex-handoff-0.6.13.md](docs/codex-handoff-0.6.13.md)

