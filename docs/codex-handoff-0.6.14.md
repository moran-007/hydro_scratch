# Codex 交接文档：Scratch 插件 0.6.14

更新时间：2026-06-16

## 当前目标

本轮把 Scratch 算法题从单一“变量输入/变量输出”扩展为可配置输入输出模式，重点支持两类真实课堂题型：

- 问答式题目：学生使用“询问并等待”“回答”“说”完成输入输出。
- 列表处理题：判题器把测试数据写入 Scratch 列表，学生把结果写入 `result` 等指定变量。

## 当前版本

- 插件版本：`0.6.14`
- 主分支：`main`
- GitHub 远端：`https://github.com/moran-007/hydro_scratch.git`
- 推荐生产覆盖包：`release/hydro-plugin-scratch-update-0.6.14.tgz`
- Windows 覆盖包：`release/hydro-plugin-scratch-update-0.6.14.zip`
- 完整安装包：`release/hydro-plugin-scratch-0.6.14.tgz`

## 已完成内容

### 算法判题核心

相关文件：

- `src/types.ts`
- `src/static-judge.ts`
- `src/algorithm-judge.ts`

新增字段：

- `algorithm.inputMode`: `ask` / `variable` / `list`
- `algorithm.outputMode`: `say` / `variable` / `list`

行为说明：

- `inputMode: "ask"`：判题器监听 Scratch VM 的 `QUESTION` 事件，并按测试点输入自动发送 `ANSWER`。
- `outputMode: "say"`：判题器监听 `SAY` 事件，读取最后一次非空说话内容作为输出。
- `inputMode: "list"`：测试点输入为 JSON 数组时，直接写入指定 Scratch 列表。
- `outputMode: "variable"`：读取指定变量，例如排序题的 `result`。
- 未配置 `inputMode/outputMode` 的旧题继续走原来的变量/列表自动探测逻辑，保持兼容。

### 教师页面

相关文件：

- `templates/scratch_problem_create.html`
- `templates/scratch_problem_edit.html`
- `templates/scratch_problem_config.html`
- `src/http.ts`

完成内容：

- 创建页、编辑页、配置页新增“输入方式”和“输出方式”下拉框。
- 新算法题默认表单推荐“询问回答输入 + 角色说出结果”。
- 旧表单若没有提交模式字段，后端仍按变量输入/变量输出保存，避免旧请求行为变化。
- 快速录入示例更新为中文问答题和列表排序题。

### 教师文档与模板

相关文件：

- `README.md`
- `UPDATE.md`
- `DEPLOY.md`
- `docs/teacher-judge-config-guide.md`
- `docs/templates/judge-config-algorithm-io.json`
- `docs/templates/judge-config-algorithm-list-result.json`

完成内容：

- README 更新到 0.6.14。
- 更新说明新增 0.6.14 小节。
- 教师配置说明新增“算法题输入输出方式（0.6.14+）”。
- 通用算法题模板加入问答式样例。
- 新增列表排序题模板，配置为 `inputMode: "list"`、`inputList: "list"`、`outputMode: "variable"`、`outputVariable: "result"`。

## 测试状态

已执行：

```bash
npm run build
npx vitest run test\algorithm-judge.test.ts
npx vitest run test\sb3.test.ts -t "checks dynamic sprite position"
npm run check
```

结果：

- TypeScript 编译通过。
- 新增算法测试 4 个全部通过。
- 旧的 Scratch VM 动态坐标测试单独复跑通过。
- 全量 `npm run check` 通过：5 个测试文件，36 个测试。

新增算法测试覆盖：

- 旧式变量/列表兼容输入输出。
- `ask/answer/say` 问答式题目。
- 非法输入后重复询问，并按数组输入顺序自动回答。
- `list` 列表输入。
- `result` 变量输出。
- 排序题两个样例。

全量 `npm test` 第一次运行时，旧的 `test/sb3.test.ts` 动态坐标用例出现 5 秒超时；单独复跑通过，随后 `npm run check` 全量通过，判断为 Scratch VM 偶发慢启动。

## 生产更新命令

```bash
tar -xzf /chajian/hydro-plugin-scratch-update-0.6.14.tgz -C /root/.hydro/addons/hydro-plugin-scratch --strip-components=1
cd /root/.hydro/addons/hydro-plugin-scratch
yarn --production
pm2 restart hydro
```

如果 Hydro 不是 pm2 部署，请使用实际重启方式。

## 后续建议

- 线上创建一题问答式算法题，验证“日期转换”“判断 3 的倍数”能自动判分。
- 线上创建一题列表排序题，配置 `list -> result`，验证提交成绩能写回普通题目、比赛、训练、作业上下文。
- 后续可把快速录入扩展成表格模式，进一步降低 10 个以上测试点录入成本。
- 不要把线上账号密码写入仓库；需要线上测试时在当前对话临时提供即可。
