# Hydro Scratch 插件安装与更新

当前版本：`0.6.14`

推荐文件：

- 首次安装：`release/hydro-plugin-scratch-0.6.14.tgz`
- 已安装后的覆盖更新：`release/hydro-plugin-scratch-update-0.6.14.zip`
- Linux 服务器覆盖更新：`release/hydro-plugin-scratch-update-0.6.14.tgz`

## 本次更新 0.6.14

- 算法题输入输出逻辑重构：新增 `inputMode` 和 `outputMode`，支持“询问回答输入、变量输入、列表输入”和“角色说出结果、变量输出、列表输出”。
- 支持 Scratch 问答式算法题自动判题：判题器会监听“询问并等待”，按测试点自动回答，并读取角色最后一次“说”内容作为输出。
- 支持列表数据题：可把测试点 JSON 数组直接写入 Scratch 列表，再读取 `result` 等指定变量作为输出，适合排序、筛选、统计题。
- 创建页、编辑页、配置页新增“输入方式/输出方式”下拉选项，老师无需手写 JSON 即可切换问答题、变量题、列表题。
- 算法题示例和教师模板更新为中文问答题与列表排序题，新增 `docs/templates/judge-config-algorithm-list-result.json`。
- 补充自动测试：覆盖问答式 `ask/answer/say`、重复询问、列表输入、`result` 变量输出和旧版变量/列表兼容逻辑。

## 本次更新 0.6.13

- 创建 Scratch 题目页改为一站式配置：题面、题目类型、提交方式、测评方式、满分、算法测试点、高级 JSON 和作品限制可在同一页完成。
- 创建页提交时会直接保存完整 Scratch 配置，不再只保存题型后再跳转配置页；创建成功后进入编辑页，方便继续上传模板或微调。
- 编辑页和独立配置页取消“切换算法题后先保存一次才能看到测试点”的流程，算法测试点快速录入区始终可展开。
- 选择算法题时，测试点区会自动展开；若测评方式仍是手动评分，会自动建议切到动态运行，减少漏配。
- 补充算法题自动测试：覆盖 10 个输入输出测试点、多行输入、列表类型输入、输出比较、隐藏失败点、得分累加，以及列表输出和总分缩放。

## 本次更新 0.6.12

- 算法题新增老师友好的“测试点快速录入”表单，每行按 `输入 => 期望输出 => 分值 => 名称` 填写即可生成 `algorithm.cases`。
- 快速录入支持多行输入写法 `\n`、隐藏测试点行首 `*`、输出比较方式、运行等待时间和单点超时时间。
- 创建、导入、编辑、配置、提交列表、预览、评分等 Scratch 插件页面改为中文文案，减少老师出题时看到英文配置项。
- 新建题目入口显示为“Scratch 题目”，插件配置说明也改为中文。
- 提交后的成绩卡和成绩弹窗使用中文状态展示，比赛场景仍按 Hydro 比赛类型决定是否显示具体分数。
- 老师下载的题目及测试点格式说明增加算法题快速录入格式和示例。

## 本次更新 0.6.11

- 新增 Scratch 题目类型：`任务题` 与 `算法题`。老题默认按任务题处理，已有任务点判题逻辑不变。
- 任务题继续使用 `staticChecks`、`structureChecks`、`dynamicChecks` 按任务点得分。
- 算法题新增 `algorithm.cases` 批量输入输出测试，默认向 Scratch 变量 `input` 写入输入，运行绿旗后读取 `output` 变量判分。
- 算法题支持 `exact`、`trim`、`tokens`、`number` 四种输出比较方式，支持隐藏测试点。
- 创建、编辑、配置、导入、导出题目时都会保留 `problemKind` 分类。
- 新增老师模板：`docs/templates/judge-config-algorithm-io.json`。

## 本次更新 0.6.10

- Scratch 题目在 Hydro 原生题目侧栏中直接复用“进入在线编程模式”入口，点击后进入 Scratch 答题页。
- 普通题、比赛题、作业题都会保留 `tid` 上下文，避免从比赛/作业入口进入编辑器后提交丢失来源。
- 非 Scratch 题目继续使用 Hydro 原有在线编程模式，提交、判题、暂存、成绩和批改队列逻辑不变。
- 题面中的旧 Scratch 答题入口会在运行时统一替换为“进入在线编程模式”备用入口，旧题面无需手动清理。

## 本次更新 0.6.9

- 修复未启用域仍可能显示“Scratch Problem”创建标签的问题，创建入口会优先读取 Hydro 页面上下文中的域 ID。
- 新增域级 Scratch 待批改队列 `/scratch/review`，老师无需先进入具体题目即可查看当前域内所有有权限评分的待处理提交。
- 域级队列默认只显示待评分提交，并支持按题号、题目名称、比赛或作业名称、来源和评分状态筛选。
- 单题 Scratch 提交列表新增“全部待批改”入口，评分完成后可以返回原筛选队列继续处理。
- 新提交的手动测评题和自动测评失败转人工处理的题目使用 Hydro Waiting 状态，因此可在 Hydro 原生测评记录的“待处理”筛选中查询。
- 保留旧版待评分记录兼容逻辑，升级不会丢失原有 Scratch 提交或评分入口。

详细说明：`docs/scratch-manual-review-0.6.9.md`

## 本次更新 0.6.8

- 新增插件级 `enabledDomains` 域作用范围配置，由系统管理员决定 Scratch 插件在哪些 Hydro 域中生效。
- `enabledDomains` 为空时保持原行为，插件在所有域生效，升级后不会影响现有站点。
- 配置域列表后，未启用域会隐藏“Scratch Problem”新建入口，不再向题面注入 Scratch 操作入口，并阻止编辑器、草稿、提交、预览、评分、导入导出和配置文档等插件路由。
- 从作用范围移除域不会删除已有 Scratch 题目、提交、草稿或存储文件，重新加入后可以继续使用。
- Scratch 编辑器内部功能和 `gui.js?v=0.6.7` 静态资源保持不变。

管理员配置示例：

```yaml
enabledDomains:
  - scratch
  - classroom
```

请填写 URL `/d/<域ID>/` 中的域 ID，例如 `http://moran007.top/d/scratch/` 对应 `scratch`。保存插件配置后，Hydro 会重新加载插件配置；如部署环境未自动刷新，请重启 Hydro。

## 本次更新 0.6.7

- 修复比赛/作业题面中已存在 Scratch 动作区时，`进入 Scratch 答题页面` 旧链接不会自动携带 `tid` 的问题。
- Scratch 编辑器入口增加来源页兜底识别：如果 URL 没有 `tid`，会从同域题面 Referer 的 `tid` 中恢复比赛上下文。
- 线上验证：直接带 `tid` 的自动测评提交可以写入比赛题目列表和榜单；本补丁修复学生正常点击题面入口时丢失 `tid` 的源头。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.7`。

## 本次更新 0.6.6

- Scratch 提交后统一同步 Hydro 题目状态，训练页可读取最新自动/手动测评结果。
- 比赛和作业提交会同步写入对应 journal，提交后弹窗提供返回题目与返回列表入口。
- 手动评分增加 record 保底写回，并继续通过 Hydro judge 回调刷新题目、比赛和作业成绩。
- Scratch 内部题目窗口支持拖动和右下角调整大小。
- 教师配置、编辑、创建和导入页新增“题目及测试点格式文档”下载链接。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.6`。

## 本次更新 0.6.5

- 全屏入口替换 Scratch 顶栏原教程位置，不再使用悬浮按钮，占用更少编辑空间。
- Scratch 内部题目窗口支持拖动，拖动标题栏即可移动到任意可视位置。
- 原右下角 `⋯` 设置面板收进 Scratch 顶栏 Settings 菜单，包含保存草稿、自动暂存、主题色、查看原题、提交记录和下载模板入口。
- 最近成绩卡嵌入 Scratch 顶栏 Debug 旁边，提交后由外层测评结果同步更新。
- 移除语言菜单的 `scrollIntoView` 触发点，继续避免切换语言或打开菜单时页面乱跳。

- 修复 Scratch GUI 语言菜单切换时触发外层页面滚动/跳页的问题，语言点击会阻止多余事件冒泡，已选语言只在菜单内部就近定位。
- Scratch 编辑器内部新增右上侧 `全屏` 按钮，可直接进入显示器全屏；浏览器限制 iframe 全屏时，会回退到外层答题工作区全屏。
- 外层 iframe 增加 `fullscreen` 权限，答题工作区在全屏状态下占满 `100vw x 100vh`，Scratch 编辑区同步拉满。

- Scratch 内部 `查看题目` 改为打开 iframe 内部题目面板，支持题面图片、表格和常规 HTML 内容。
- 继续保留 Scratch 工作区纯文本注释作为兜底，图片内容由内部题目面板展示。
- 题面 HTML 会过滤外部入口和危险属性，并把相对图片地址转换为可加载地址。
- 右下角 `⋯` 设置工具条支持整体拖动，位置按题目保存在浏览器本地。
- 隐藏 Scratch/Blockly 右下角缩放放大镜控件，并尝试隐藏 Hydro 页面级浮动搜索/放大按钮，减少遮挡。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.5`。

## 本次更新 0.6.2

- 去掉外层题目便签浮层，避免无法关闭或遮挡 Scratch 工作区。
- Scratch GUI 顶栏 `查看题目` 改为在 Scratch 内部生成/打开工作区注释，题目文本会自动过滤外层入口、提交、查看原题等链接。
- 右下角设置面板保留为小型 `⋯` 按钮，自动暂存、主题色、查看原题、提交记录都可以明确收起。
- 最近成绩卡片支持拖动和手动隐藏，减少对积木区域的遮挡。
- 提交测评后新增居中的成绩弹窗，展示状态、得分和提交记录入口。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.2`。

## 本次更新 0.6.1

- 重新优化答题页布局：Scratch 编辑区成为主区域，不再显示外层 Scratch 标题栏。
- 题目区改为左侧可折叠抽屉，收起后类似窄导航栏，点击即可打开。
- 题目区支持拖动右侧边缘调整宽度，宽度按题目保存到浏览器本地。
- 外层重复的提交按钮已删除，提交统一使用 Scratch 内部 `提交测评`。
- 外层按钮收敛到题目抽屉和一个小型更多菜单，减少占用 Scratch 顶栏和工作区。
- 题目便签改成 Scratch 区域内部浮层，更接近 Scratch 注释贴纸的使用方式。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.1`。

## 本次更新 0.6.0

- 普通 Hydro 题面会自动追加更清晰的入口：`进入 Scratch 答题页面`、`查看我的提交`，教师还能看到提交与编辑入口。
- Scratch 答题页支持左侧题面收起和展开，右侧 Scratch 编辑区会自动占满剩余空间。
- 题面支持贴纸模式，可像便签一样浮在编辑区左侧，方便学生边看题边搭积木。
- Scratch GUI 顶栏新增 `查看题目` 按钮，与 `提交测评` 按钮放在一起。
- 提交后不再立刻跳回题面，而是在当前答题页读取本次提交报告并展示成绩、状态和测评记录入口。
- 暂存逻辑增强：进入题目优先恢复当前学生的最近草稿；提交成功后会同步保存当前作品为草稿；自动暂存和手动暂存都会显示状态。
- 答题页增加主题色选择，可保存到浏览器本地，并会尽量同步到内嵌 Scratch 顶栏。
- Scratch GUI 静态资源版本号更新为 `gui.js?v=0.6.0`。

## 历史关键更新

- `0.5.2`：将 `scratch-render-fonts` 显式加入生产依赖，修复动态判题依赖缺失。
- `0.5.1`：修复 `/scratch/problem/import` 在部分 Hydro 版本中的 `domainId` 参数兼容问题。
- `0.5.0`：新增 Hydro 原生 Scratch 题目包导入导出，支持 `.scratch-problem.zip`。
- `0.4.0`：新增静态、结构、动态、混合自动判题。

## 首次安装

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

然后重启 Hydro。

## 服务器安装打包文件

上传标准插件包：

```bash
scp release/hydro-plugin-scratch-0.6.9.tgz <user>@<server>:/tmp/
scp scripts/install-production.sh scripts/rollback-production.sh <user>@<server>:/tmp/
```

在服务器执行：

```bash
chmod +x /tmp/install-production.sh /tmp/rollback-production.sh
/tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.9.tgz
```

如果 Hydro 插件目录不是默认路径：

```bash
HYDRO_ADDONS_DIR=/path/to/hydro/addons /tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.9.tgz
```

## 覆盖更新

Windows 可使用：

```text
release/hydro-plugin-scratch-update-0.6.9.zip
```

Linux 可使用：

```bash
tar -xzf /tmp/hydro-plugin-scratch-update-0.6.9.tgz -C ~/.hydro/addons/hydro-plugin-scratch --strip-components=1
```

然后刷新生产依赖并重启 Hydro：

```bash
cd ~/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果不是 pm2 部署，请使用你的实际 Hydro 重启方式。

## 验证

1. 保持 `enabledDomains` 为空，确认所有域中的现有 Scratch 功能与升级前一致。
2. 将 `enabledDomains` 设置为指定域 ID，确认只有这些域显示 `Scratch Problem` 新建入口和题面 Scratch 操作入口。
3. 在未启用域中直接访问 `/scratch/problem/create` 或 Scratch 编辑器地址，确认返回未找到。
4. 在启用域中打开普通 Hydro 题面，确认能看到 `进入 Scratch 答题页面`。
5. 进入 Scratch 答题页，确认左侧题面可收起、展开、拖拽调整宽度。
6. 点击 Scratch 顶栏的 `查看题目`，确认 Scratch 内部题目面板打开，图片能正常显示。
7. 点击 `保存草稿`，刷新页面后确认能恢复作品。
8. 修改作品后点击 `提交测评`，确认页面弹出成绩弹窗，并显示本次成绩和测评记录入口。
9. 重新进入同一题目，确认仍能加载最近草稿。
10. 检查 `public/scratch-editor/index.html` 中资源版本仍为 `gui.js?v=0.6.7`。
11. 提交一道人工作评分 Scratch 题，确认 `/scratch/review` 无需进入具体题目即可显示该待评分提交。
12. 在 Hydro 测评记录中筛选“待处理”，确认新提交的手动测评记录可以查询。

## 注意事项

- 本版本没有加入图片主题上传，因为它会牵涉服务器存储、权限和安全校验；当前先提供稳定的颜色主题。
- 如果编辑器配置为外部跨域 URL，父页面可能无法给 Scratch 顶栏注入主题色，但答题页外层主题仍可正常生效。
- 覆盖更新后请清理浏览器缓存或使用无痕窗口验证，避免旧 `gui.js` 被缓存。
- 动态判题依赖 `scratch-vm` 和 `scratch-render-fonts`，服务器部署时必须执行 `yarn --production`。
