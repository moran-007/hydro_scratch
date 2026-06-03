# Hydro 原生 Scratch 题目包说明

## 目标

`0.5.0` 开始，Scratch 插件支持把一道题按 Hydro 原生题目的方式打包、导入和导出。老师可以在一个 Hydro 站点配置好题面、Scratch 模板、自动判题规则，再导出为 `.zip`，导入到另一个 Hydro 站点继续使用。

导入后的结果仍然是一道普通 Hydro 题目，只是额外写入了 Scratch 插件配置。

## 入口

导入：

```text
/scratch/problem/import
```

导出：

```text
/scratch/problem/:pid/export
```

也可以在 Scratch 题目配置页或编辑页点击 `Export Package`。

## 文件结构

题目包必须是 `.zip` 文件。推荐结构如下：

```text
problem.yaml
statement.md
scratch-judge.json
template.sb3
```

必需文件：

- `problem.yaml`：题目元信息与 Scratch 基础配置。
- `statement.md`：Hydro 题面 Markdown。
- `scratch-judge.json`：自动判题测试点配置。

可选文件：

- `template.sb3`：老师提供给学生的初始 Scratch 工程。

插件会忽略 ZIP 中其他文件。为了安全，导入时会拒绝不安全路径，例如 `../problem.yaml`。

## problem.yaml 模板

```yaml
format: hydro-scratch-problem
version: 1
pid: scratch_move_01
title: 角色移动到指定位置
hidden: false
tags:
  - Scratch
  - 自动测评
scratch:
  enabled: true
  submitMode: both
  judgeMode: hybrid
  maxScore: 100
  allowDownloadTemplate: true
  disabledScratchExtensions:
    - videoSensing
  limits:
    maxProjectSizeMB: 20
    maxUnpackedSizeMB: 80
    maxAssetSizeMB: 10
    maxAssetCount: 300
    maxProjectJsonSizeMB: 10
  template: template.sb3
```

字段说明：

- `format`：固定为 `hydro-scratch-problem`。
- `version`：当前为 `1`。
- `pid`：可选。建议使用字母开头的英文 ID，例如 `scratch_move_01`。纯数字会被视为 Hydro 自动题号，不作为固定 pid 使用。
- `title`：题目标题，必填。
- `hidden`：是否导入为隐藏题目。
- `tags`：Hydro 题目标签；插件会自动补充 `Scratch`。
- `scratch.enabled`：是否启用 Scratch 题目能力。
- `scratch.submitMode`：`editor`、`upload`、`both`。
- `scratch.judgeMode`：`manual`、`static`、`dynamic`、`hybrid`。
- `scratch.maxScore`：总分。
- `scratch.allowDownloadTemplate`：学生是否可以下载模板。
- `scratch.disabledScratchExtensions`：禁用的 Scratch 扩展。
- `scratch.limits`：`.sb3` 文件体积、解包大小、资源数量等限制。
- `scratch.template`：模板文件名，通常写 `template.sb3`。

## statement.md 模板

```markdown
# 角色移动到指定位置

请在 Scratch 中完成：

1. 使用名为 `Player` 的角色。
2. 点击绿旗后，让 `Player` 移动到 `x = 100, y = 0`。
3. 保留完整脚本并提交 `.sb3` 文件。

评分：

- 角色存在：10 分
- 脚本顺序正确：30 分
- 运行后位置正确：60 分
```

导出时，插件会自动去掉题面里由插件追加的“打开 Scratch 在线编辑器”等入口，只保留老师原始题面。

## scratch-judge.json 模板

```json
{
  "schemaVersion": 2,
  "totalScore": 100,
  "staticChecks": [
    {
      "name": "存在 Player 角色",
      "type": "sprite_exists",
      "sprite": "Player",
      "score": 10
    }
  ],
  "structureChecks": [
    {
      "name": "Player 绿旗脚本顺序正确",
      "type": "script_sequence",
      "target": "Player",
      "hat": "event_whenflagclicked",
      "sequence": [
        "event_whenflagclicked",
        "motion_gotoxy",
        "motion_movesteps"
      ],
      "score": 30
    }
  ],
  "dynamicChecks": [
    {
      "name": "Player 到达目标位置",
      "type": "sprite_position",
      "target": "Player",
      "expected": {
        "x": 100,
        "y": 0
      },
      "tolerance": 5,
      "score": 60,
      "steps": [
        {
          "action": "green_flag"
        },
        {
          "action": "wait",
          "ms": 800
        }
      ]
    }
  ],
  "dynamicOptions": {
    "timeoutMs": 5000,
    "positionTolerance": 5
  }
}
```

更多测试点说明见：

- `docs/teacher-judge-config-guide.md`
- `docs/templates/judge-config-hybrid-position.json`
- `docs/templates/judge-config-keypress-variable.json`
- `docs/templates/judge-config-static-structure-only.json`

## 老师手工制作题目包步骤

1. 新建一个文件夹，例如 `scratch_move_01`。
2. 在文件夹中创建 `problem.yaml`。
3. 在文件夹中创建 `statement.md`。
4. 在文件夹中创建 `scratch-judge.json`。
5. 可选：放入 `template.sb3`。
6. 选中这些文件压缩为 `.zip`。注意不要把外层文件夹作为唯一根目录压进去，推荐 ZIP 根目录直接看到 `problem.yaml`。
7. 登录 Hydro 管理员或有出题权限的账号。
8. 打开 `/scratch/problem/import` 上传 ZIP。
9. 导入后进入题目配置页，检查题面、模板和判题配置。
10. 用通过样例和失败样例各提交一次，确认 Record 分数与测试点明细正确。

## 从已有题目迁移步骤

1. 打开已有 Scratch 题目配置页。
2. 点击 `Export Package`。
3. 下载 `.scratch-problem.zip`。
4. 在目标 Hydro 站点打开 `/scratch/problem/import`。
5. 上传 ZIP。
6. 如目标站点已有同名 pid，在导入页填写新的 `Problem ID Override`。
7. 导入后重新提交样例验证。

## 注意事项

- 导出的 ZIP 包包含隐藏判题配置，应该只给老师或管理员使用。
- `template.sb3` 会在导入时进行 Scratch 工程校验；无效文件会导致导入失败。
- 跨站迁移时不建议使用纯数字 pid。纯数字属于 Hydro 内部 docId，插件导入时会让 Hydro 自动生成。
- 动态判题依赖服务端 `scratch-vm`，生产部署必须安装依赖。
- 如果题目使用动态判题，建议至少准备一个失败样例，避免测试点条件过宽。
- 位置类判题建议配置 `tolerance`，Scratch 运行过程中浮点和帧时序可能产生微小误差。
- 包大小上限按插件安全限制处理，单个条目最大约 64MB，整体最大约 128MB。

## 可直接复制的样例

样例文件位于：

```text
docs/templates/problem-package/problem.yaml
docs/templates/problem-package/statement.md
docs/templates/problem-package/scratch-judge.json
```

把这三个文件和一个真实 `template.sb3` 放入同一个 ZIP，即可作为第一份 Hydro 原生 Scratch 题目包使用。
