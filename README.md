# hydro-plugin-scratch

这是根据 `hydro_scratch_integration_technical_design.md` 的最终建议完成的第一期 MVP 插件仓库。

第一期目标是先支持 Scratch 作品上传、保存、预览、下载和教师人工评分，避免在早期把 Scratch editor 或 VM 动态评测深度耦合进 Hydro 主体。

## 已完成能力

- Scratch 题目创建入口：在 Hydro 题目创建区增加 `Scratch Problem`。
- 教师配置页：`/scratch/problem/:pid/config` 可启用 Scratch、调整限制、上传模板。
- 题目 Scratch 配置：`GET/POST /scratch/problem/:pid/config`。
- 模板项目上传/下载：`GET/POST /scratch/problem/:pid/template`。
- 学生 `.sb3` 提交：`POST /scratch/submit/:pid`。
- `.sb3` 安全校验：扩展名、合法 zip、`project.json`、zip slip、解压总大小、素材数量、单素材大小、嵌套压缩包、异常压缩率。
- 提交记录保存：创建 Hydro record，文件进入 Hydro Storage。
- 提交预览页：`GET /scratch/submission/:rid/preview`。
- 项目下载：`GET /scratch/submission/:rid/project`。
- 评测报告接口：`GET /scratch/submission/:rid/report`。
- 教师人工评分：`POST /scratch/submission/:rid/score`，分数回写 Hydro record，并进入题目/作业/比赛统计链路。

## 安装

开发目录直接挂载：

```bash
npm install
npm run build
hydrooj addon add E:/Users/moran/Documents/hydro_chajian
```

生成可分发插件包：

```bash
npm run pack:plugin
```

生成物位于 `release/hydro-plugin-scratch-0.1.0.tgz`。Hydro 的 `hydrooj install` 命令需要可下载的 `.tgz/.zip` URL；如果只在本机测试，使用上面的 `hydrooj addon add` 方式即可。

## 预览说明

默认预览使用 `previewPlayerUrl = https://turbowarp.org/embed?autoplay&addons=pause`，并把 Hydro 的临时 `.sb3` 下载 URL 作为 `project_url` 传入。

生产环境如果需要完全自托管，可以将 `previewPlayerUrl` 改为自行部署的 Scratch editor/player 地址，或留空以启用“仅下载预览页”。

## API 摘要

```text
GET  /scratch/problem/:pid/config
POST /scratch/problem/:pid/config

GET  /scratch/problem/:pid/template
POST /scratch/problem/:pid/template

GET  /scratch/problem/:pid/submissions
POST /scratch/submit/:pid

GET  /scratch/submission/:rid/project
GET  /scratch/submission/:rid/preview
GET  /scratch/submission/:rid/report
POST /scratch/submission/:rid/score
```

## 本地验证

```bash
npm run check
```

当前测试覆盖 `.sb3` 最核心的安全边界：合法项目、非 `.sb3` 扩展名、缺少 `project.json`、zip slip、解压大小限制。

## 参考代码

本仓库开发时已将以下仓库浅克隆到 `.refs/` 供本地查阅，不会进入提交：

- `hydro-dev/Hydro`
- `scratchfoundation/scratch-editor`
