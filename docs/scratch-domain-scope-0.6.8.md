# Scratch 插件域作用范围配置说明

适用版本：`hydro-plugin-scratch 0.6.8+`

## 1. 功能说明

系统管理员可以通过插件级 `enabledDomains` 配置，决定 Scratch 插件在哪些 Hydro 域中生效。

该配置只控制插件入口和插件路由，不修改 Scratch 编辑器、自动测评、手动评分、比赛成绩同步、草稿、题目配置或题目包导入导出等内部逻辑。

## 2. 配置示例

在 Hydro 的插件配置中设置：

```yaml
enabledDomains:
  - scratch
  - classroom
```

请填写 URL 中的域 ID，不要填写域显示名称。

例如：

```text
http://moran007.top/d/scratch/
```

对应的域 ID 是：

```text
scratch
```

域 ID 会自动去除首尾空格，并按不区分大小写的方式比较。

## 3. 默认兼容行为

以下配置表示插件在所有域中生效：

```yaml
enabledDomains: []
```

如果完全不填写 `enabledDomains`，效果相同。升级到 `0.6.8` 后，现有站点默认不会发生功能变化。

## 4. 启用域中的行为

在 `enabledDomains` 列表中的域会继续使用完整 Scratch 插件功能，包括：

- 新建 Scratch 题目。
- Scratch 题目配置、编辑、导入和导出。
- Scratch 答题编辑器、草稿保存和恢复。
- 自动测评、手动评分和 Hydro 成绩同步。
- 提交预览、下载、测评报告和评分页面。
- 题目及测试点格式文档下载。

## 5. 未启用域中的行为

不在 `enabledDomains` 列表中的域会：

- 隐藏“Scratch Problem”新建入口。
- 不向普通 Hydro 题面注入 Scratch 答题、提交记录、配置等操作入口。
- 阻止 Scratch 编辑器、草稿、提交、预览、评分、配置、导入导出和文档下载路由。
- 保留普通 Hydro 题目页面和普通 Hydro 功能。

共享静态资源路由 `/scratch-assets` 仍然全局可用，因为启用域中的 Scratch 编辑器需要使用这些资源。

## 6. 数据保留

将某个域从 `enabledDomains` 中移除不会删除该域已有的：

- Scratch 题目配置。
- 学生提交记录。
- 草稿。
- `.sb3` 模板和提交文件。
- 自动测评结果和手动评分结果。

以后重新把该域加入 `enabledDomains`，原有 Scratch 数据可以继续使用。

## 7. 管理员验证步骤

1. 保持 `enabledDomains` 为空，确认现有域中的 Scratch 功能与升级前一致。
2. 将 `enabledDomains` 设置为一个测试域 ID，并保存插件配置。
3. 打开启用域的题库，确认可以看到“Scratch Problem”新建入口。
4. 打开启用域中的 Scratch 题目，确认题面仍显示 Scratch 答题入口。
5. 打开未启用域的题库，确认不显示“Scratch Problem”新建入口。
6. 打开未启用域中的原 Scratch 题目，确认不再显示 Scratch 操作入口。
7. 在未启用域中直接访问 `/scratch/problem/create` 或 Scratch 编辑器地址，确认返回未找到。
8. 将该域重新加入 `enabledDomains`，确认原题目、草稿和提交记录仍可继续使用。

## 8. 注意事项

- 该配置是系统级插件配置，不是单道题目的 Scratch 设置。
- 修改配置后 Hydro 通常会重新加载插件；如果部署环境未自动刷新，请重启 Hydro。
- 域作用范围用于控制插件能力，不用于删除数据或迁移题目。
- 如果需要彻底清理某个域的 Scratch 数据，应单独制定数据清理方案，不要依赖 `enabledDomains`。
