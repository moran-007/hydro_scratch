# Hydro Scratch 插件安装与更新教程

当前版本：`0.2.4`

推荐文件：

- 首次安装：`release/hydro-plugin-scratch-0.2.4.tgz`
- 已安装后的免依赖更新：`release/hydro-plugin-scratch-update-0.2.4.zip`
- Linux 服务器也可用：`release/hydro-plugin-scratch-update-0.2.4.tgz`

## 一、首次安装

首次安装需要安装一次生产依赖。以后只要依赖没有变化，就使用“免依赖覆盖更新”。

### 方式 A：本机源码目录安装

在插件目录执行：

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

然后重启 Hydro。

### 方式 B：服务器安装打包文件

把标准插件包上传到服务器：

```bash
scp release/hydro-plugin-scratch-0.2.4.tgz <user>@<server>:/tmp/
scp scripts/install-production.sh scripts/rollback-production.sh <user>@<server>:/tmp/
```

在服务器上执行：

```bash
chmod +x /tmp/install-production.sh /tmp/rollback-production.sh
/tmp/install-production.sh /tmp/hydro-plugin-scratch-0.2.4.tgz
```

默认安装目录：

```text
~/.hydro/addons/hydro-plugin-scratch
```

如果你的 Hydro 插件目录不同：

```bash
HYDRO_ADDONS_DIR=/path/to/hydro/addons /tmp/install-production.sh /tmp/hydro-plugin-scratch-0.2.4.tgz
```

安装完成后重启 Hydro：

```bash
pm2 restart hydro
# 或
sudo systemctl restart hydrooj
# 或重启你的 Hydro Docker 容器
```

## 二、免依赖覆盖更新

适用于已经安装过 `hydro-plugin-scratch`，并且只是更新插件代码、模板、Scratch GUI、素材代理等内容。

这一步不需要执行 `npm install`。

### Windows 覆盖更新

1. 停止 Hydro，或准备覆盖后立即重启。
2. 备份当前插件目录，例如：

```powershell
Copy-Item -Recurse -Force `
  "$env:USERPROFILE\\.hydro\\addons\\hydro-plugin-scratch" `
  "$env:USERPROFILE\\.hydro\\addons\\hydro-plugin-scratch.bak.0.2.4"
```

3. 解压：

```text
release/hydro-plugin-scratch-update-0.2.4.zip
```

4. 将解压出来的内容覆盖到：

```text
%USERPROFILE%\.hydro\addons\hydro-plugin-scratch
```

5. 重启 Hydro。

### Linux 覆盖更新

假设插件目录是 `~/.hydro/addons/hydro-plugin-scratch`：

```bash
cd ~/.hydro/addons
cp -a hydro-plugin-scratch "hydro-plugin-scratch.bak.$(date +%Y%m%d%H%M%S)"
tar -xzf /tmp/hydro-plugin-scratch-update-0.2.4.tgz -C hydro-plugin-scratch --strip-components=1
```

然后重启 Hydro：

```bash
pm2 restart hydro
# 或
sudo systemctl restart hydrooj
```

## 三、验证安装

重启后检查：

```bash
hydrooj addon list
```

然后在 Hydro 中验证：

1. 进入 `/scratch/problem/create`，确认可以创建 Scratch 题目。
2. 创建后进入普通 Hydro 题面，确认题面图片和附件按 Hydro 原格式正常显示。
3. 点击题面中的 Scratch 在线编辑器链接，进入在线编程。
4. 点击素材库，选择角色、造型、背景或声音，确认能加载到舞台。
5. 点击浮动窗口，确认 Scratch 编辑器可以拖动和调整大小。
6. 点击保存草稿，刷新后确认草稿可以恢复。
7. 点击提交，后台进入 `/scratch/problem/:pid/submissions` 查看提交。
8. 打开 `/scratch/submission/:rid/score`，确认教师可以单独手动评分。
9. 在比赛或作业中从题面进入 Scratch 编辑器提交，再评分，确认成绩表更新。

## 四、常见问题

### 1. 素材库仍然无法加载

先强制刷新浏览器缓存：

```text
Ctrl + F5
```

或者清理浏览器缓存后重新进入编辑器。

确认编辑器加载的是新版本：

```text
/scratch-editor/index.html
```

页面中应加载：

```text
gui.js?v=0.2.4
```

### 2. 不要重复安装依赖

只要 `package.json` 的 dependencies 没有变化，使用更新包覆盖即可：

```text
release/hydro-plugin-scratch-update-0.2.4.zip
```

不要执行：

```bash
npm install
yarn install
```

### 3. 覆盖后页面还是旧的

处理顺序：

1. 重启 Hydro。
2. 清浏览器缓存或无痕窗口测试。
3. 确认插件目录中的 `public/scratch-editor/gui.js` 已被覆盖。
4. 确认 `public/scratch-editor/index.html` 中版本是 `0.2.4`。

## 五、回滚

如果覆盖更新后出现问题，恢复备份目录。

Linux 示例：

```bash
cd ~/.hydro/addons
rm -rf hydro-plugin-scratch
mv hydro-plugin-scratch.bak.YYYYmmddHHMMSS hydro-plugin-scratch
hydrooj addon add ~/.hydro/addons/hydro-plugin-scratch
pm2 restart hydro
```

如果使用了 `scripts/install-production.sh`，可以用：

```bash
/tmp/rollback-production.sh ~/.hydro/addons/hydro-plugin-scratch.bak.YYYYmmddHHMMSS
```

回滚后同样需要重启 Hydro。
