# 发布与投稿

## 当前状态

- 仓库：https://github.com/Yiheng-guo/dsh-boot-animation-pro
- 构建产物 `lib/` **已提交**，包内无 `prepare` 生命周期脚本 →
  `dsh plugin --profile web add github:Yiheng-guo/dsh-boot-animation-pro` 不会触发任何编译。
- npm 上**未发布**。要发布的话，`package.json` 的 `files` 已经列全，直接 `npm publish` 即可
  （包名 `dsh-boot-animation-pro` 未被占用，发布前请先确认）。

## 插件市场投稿

市场不是本项目，而是一个由数据文件生成的大仓库：

- 前端注册表：`https://awesome-dsh-plugin.com/plugins.json`
- 数据源仓库：`https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`
- **一次投稿 = 往那个仓库加一个文件**：`data/plugins/Yiheng-guo__dsh-boot-animation-pro.yml`

文件名由 `owner/repo` 推导（`owner__repo`）。要提交的内容已放在本仓库里：

```
submission/data/plugins/Yiheng-guo__dsh-boot-animation-pro.yml
```

## 四道自动闸门

闸门脚本在数据源仓库里：`scripts/check-submission.mjs`，只查这几件事：

| # | 要求 | 说明 |
|---|---|---|
| 1 | 仓库内**任意** `package.json` 声明 `dsh.bundle` | 本仓库由 `package.json` 的 `dsh.bundle.patch` 满足 |
| 2 | 仓库创建**满 1 天**（≥ 24h） | 新仓库需要等 |
| 3 | 仓库存在、未归档、**非 fork** | ⚠️ 注意：如果本仓库是以 GitHub fork 方式创建的，这一条会红。用「新建仓库 + 推送」而不是「Fork」 |
| 4 | 不是 DSH 本体 | 满足 |

第 2 条失败时脚本自己会重跑，不需要重新提交、重新推送、也不需要关掉重开。

## 发布新版本前

```sh
npm run check      # 22 个套件 + 类型检查，必须全绿
npm run build      # 重建 lib/ —— 记住 lib/ 是提交进仓库的
git add -A && git commit
```

**`lib/` 必须和 `src/` 一起提交。** 用户装的是构建产物；只改 `src/` 不重建，
装上去的会是上一版的行为，而这一点从仓库页面上完全看不出来。
`scripts/verify-build.mjs` 会断言 `lib/client.js` 不比它的源文件旧。
