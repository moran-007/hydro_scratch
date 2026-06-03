# Hydro Scratch 插件安装与更新

当前版本：`0.6.5`

推荐文件：

- 首次安装：`release/hydro-plugin-scratch-0.6.5.tgz`
- 已安装后的覆盖更新：`release/hydro-plugin-scratch-update-0.6.5.zip`
- Linux 服务器覆盖更新：`release/hydro-plugin-scratch-update-0.6.5.tgz`

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
scp release/hydro-plugin-scratch-0.6.5.tgz <user>@<server>:/tmp/
scp scripts/install-production.sh scripts/rollback-production.sh <user>@<server>:/tmp/
```

在服务器执行：

```bash
chmod +x /tmp/install-production.sh /tmp/rollback-production.sh
/tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.5.tgz
```

如果 Hydro 插件目录不是默认路径：

```bash
HYDRO_ADDONS_DIR=/path/to/hydro/addons /tmp/install-production.sh /tmp/hydro-plugin-scratch-0.6.5.tgz
```

## 覆盖更新

Windows 可使用：

```text
release/hydro-plugin-scratch-update-0.6.5.zip
```

Linux 可使用：

```bash
tar -xzf /tmp/hydro-plugin-scratch-update-0.6.5.tgz -C ~/.hydro/addons/hydro-plugin-scratch --strip-components=1
```

然后刷新生产依赖并重启 Hydro：

```bash
cd ~/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果不是 pm2 部署，请使用你的实际 Hydro 重启方式。

## 验证

1. 打开普通 Hydro 题面，确认能看到 `进入 Scratch 答题页面`。
2. 进入 Scratch 答题页，确认左侧题面可收起、展开、拖拽调整宽度。
3. 点击 Scratch 顶栏的 `查看题目`，确认 Scratch 内部题目面板打开，图片能正常显示。
4. 点击 `保存草稿`，刷新页面后确认能恢复作品。
5. 修改作品后点击 `提交测评`，确认页面弹出成绩弹窗，并显示本次成绩和测评记录入口。
6. 重新进入同一题目，确认仍能加载最近草稿。
7. 检查 `public/scratch-editor/index.html` 中资源版本为 `gui.js?v=0.6.5`。

## 注意事项

- 本版本没有加入图片主题上传，因为它会牵涉服务器存储、权限和安全校验；当前先提供稳定的颜色主题。
- 如果编辑器配置为外部跨域 URL，父页面可能无法给 Scratch 顶栏注入主题色，但答题页外层主题仍可正常生效。
- 覆盖更新后请清理浏览器缓存或使用无痕窗口验证，避免旧 `gui.js` 被缓存。
- 动态判题依赖 `scratch-vm` 和 `scratch-render-fonts`，服务器部署时必须执行 `yarn --production`。
