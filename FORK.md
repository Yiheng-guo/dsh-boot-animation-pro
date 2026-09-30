# 这个仓库是什么 / What this repository is

**`dsh-boot-animation-pro` 是基于 [`NativeDog1/dsh-boot-animation`](https://github.com/NativeDog1/dsh-boot-animation)
的二次开发（fork）**，不是从零写的项目。原版的架构、测试思路和绝大部分设计判断都来自原作者
NativeDog1，本仓库在此之上做了功能扩展和若干缺陷修复。

> **This is a fork.** `dsh-boot-animation-pro` is a derivative of
> [`NativeDog1/dsh-boot-animation`](https://github.com/NativeDog1/dsh-boot-animation),
> extended with new features and fixes. See below.

## 许可 / Licence

**BSD-3-Clause**，与原版相同，见 [LICENSE](LICENSE)。
本仓库保留了原版完整的著作权声明，未修改 `LICENSE` 文件的任何字节。

> BSD-3-Clause requires that redistributions of source code retain the original
> copyright notice. `LICENSE` is carried over **byte-for-byte unmodified** from
> the upstream repository.

## 出处 / Provenance

| | |
|---|---|
| 上游仓库 | https://github.com/NativeDog1/dsh-boot-animation |
| 上游作者 | NativeDog1 |
| 本仓库起点 | 上游 `main` @ `v0.3.0`（tarball 快照） |
| 本仓库作者 | Yiheng-guo |
| 许可证 | BSD-3-Clause（未修改） |

上游是**完整快照**引入的，本仓库不共享其 git 历史 —— 因此上游后续的提交不会自动出现在这里。
想跟上游同步，用下面的方式。

## 与上游的差异 / What changed

功能扩展（用户可见）：

| # | 功能 | 说明 |
|---|---|---|
| A | **播放控制** | 音量、开片静音、倍速、进度条、倒计时自动跳过、片尾淡出 |
| B | **触发规则** | 5 种播放时机、冷却时间、会话白名单/黑名单 |
| C | **片库管理** | 重命名、删除文件、收藏置顶、5 种排序 |
| D | **画面美化** | 标题/副标题/水印，扫描线/暗角/颗粒/辉光 4 种特效 |
| E | **分时段片头** | 按星期 + 时间段自动换片头，支持跨午夜窗口 |
| G | **中英双语** | 全部界面文案进字典，可切换跟随浏览器 / 中文 / English |

设置 schema 从 **v2 升到 v3**（21 个字段），旧文件自动迁移。

修复的上游缺陷（每条都有回归测试）：

1. **点击视频无法开启声音** —— 视频元素的 `onClick` 调用了 `stopPropagation()`，而「点击开启声音 · 全屏」
   挂在父级上；铺满模式下视频填满整个父级，于是这个被写进提示文字里的交互**永远点不动**。
2. **时段规则被一条失效规则整条打断**（本仓库新增功能自身的缺陷）—— 规则指向的片段被删除后，
   解析直接返回空，而不是跳到下一条匹配规则。
3. **`selectedClipId: null` 无法清空选择** —— 删除「当前选中的片段」后会在设置文件里留下悬空选择。
4. **`startup-only` 在无会话时静默失效** —— 「每次启动播一次」本应与对话无关，却要求必须有会话，
   导致 DSH 停在设置页启动时不播。

安全加固（本仓库新增）：

5. **未鉴权的破坏性接口** —— 本仓库新增的 `POST /remove` 注册在 DSH 的普通路由上，**不受 web token 保护**。
   实测可被任意网页跨站调用删除用户的视频文件（无 cookie、无 token、无预检）。已加 `route-guard.js`
   四道闸门修复，并有专门套件原样重放该攻击。

## 目录映射 / Where things live

上游的文件名与本仓库一一对应，只是把 `dsh-boot-animation` 换成了 `dsh-boot-animation-pro`：

| 上游 | 本仓库 |
|---|---|
| `src/host/*.js` | 同名，新增 `settings.js` / `schedule.js` / `library-ops.js` / `route-guard.js` |
| `src/client/ui.ts` | 拆成 `ui-overlay.ts` / `ui-library.ts` / `ui-pin.ts` / `ui-root.ts`，`ui.ts` 变聚合出口 |
| `src/client/*.ts` | 新增 `i18n.ts` |
| `scripts/verify-*.mjs` | 全部保留并适配，新增 5 个套件 |

## 从上游取更新 / Merging upstream

```sh
# 一次性：把上游加成远程
git remote add upstream https://github.com/NativeDog1/dsh-boot-animation.git
git fetch upstream

# 看上游改了什么
git log --oneline HEAD..upstream/main

# 挑一个提交（推荐，逐条）
git cherry-pick <sha>
```

**不要直接 `git merge upstream/main`**：本仓库改过 `package.json`、`cordis.patch.yml`、全部路由前缀、
全部 CSS 类名和 localStorage 键，整分支合并会大面积冲突。逐条 cherry-pick 成本低得多。

移植上游改动时注意本仓库的三条硬约束（都写在 [ARCHITECTURE.md](ARCHITECTURE.md)）：

1. 客户端半边**不能有静态 `inject`**（否则整个 GUI 打不开）
2. 渲染文案**必须走 `i18n.ts`**，组件里不允许出现硬编码中文
3. **所有改变状态的接口必须过 `route-guard.js`**
