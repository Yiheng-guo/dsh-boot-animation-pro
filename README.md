# dsh-boot-animation-pro

给 DSH 加一段**开机动画**：打开 DSH、新对话、或你钉住的会话时，视频铺满整个窗口播放。

> 这是 [`NativeDog1/dsh-boot-animation`](https://github.com/NativeDog1/dsh-boot-animation) 的**二次开发版**，
> 增加播放控制、触发规则、片库管理、画面特效、分时段片头和中英双语界面。
> 出处、许可与差异见 **[FORK.md](FORK.md)**。English: [README.en.md](README.en.md)

## 装好之后长什么样

| | |
|---|---|
| ![铺满屏幕](docs/letterbox-cover.png) | ![完整显示](docs/letterbox-contain.png) |
| **铺满屏幕**（默认）：填满窗口，超出裁掉，**0 黑边** | **完整显示**：整帧都在，长宽比不匹配时留黑边 |

上面两张是**真实浏览器渲染实测截图**（Headless Chrome 2560×1313 视口，1280×720 片源，
`scripts/verify-letterbox.mjs` 测量）：铺满模式黑边 0px，完整显示模式左右各 113px。

## 安装

```sh
dsh plugin --profile web add github:Yiheng-guo/dsh-boot-animation-pro
```

> 仓库里已提交构建产物 `lib/`，也没有 `prepare` 生命周期脚本，所以这条命令**不编译任何东西**，
> 不触发 pnpm 的 `allowBuilds` 构建授权。

**装完必须重启一次 DSH**（bundle 层在启动时装配）：

```sh
# 停掉当前的 dsh，然后
dsh web
```

### 从源码目录安装（开发用）

```sh
git clone https://github.com/Yiheng-guo/dsh-boot-animation-pro.git
cd dsh-boot-animation-pro
npm install && npm run build && npm run check   # 可选：先自检

# 挂进 profile（默认 desktop，可 --profile web）
npm run dsh:link
# 卸载
npm run dsh:unlink
```

`scripts/dsh-link.mjs` 写的东西和 `dsh plugin add` 完全一致：profile 的 `node_modules/` 下一个符号链接、
`dependencies` 一行、`dsh.profile.bundles` 一项。可逆，且重复执行是幂等的。

### 装完看不到效果？先做这件事

DSH 的客户端 bundle 响应带 `cache-control: max-age=31536000, immutable`。装好或升级后请
**完全退出 DSH 再重开**；如果是浏览器窗口，按 **Ctrl+Shift+R（Mac 上是 Cmd+Shift+R）**硬刷新。

> DSH 桌面版**没有绑定** `Cmd+Shift+R`。用 `Cmd+Q` 退出再打开即可 —— 进程换了之后启动页会重新取，
> 而 `rev` 是**内容哈希**，内容变了 URL 就变了，不会命中旧缓存。

## 用法

### 什么时候播（触发规则）

侧边栏左下角点 **🎛** → 「**触发**」标签页，五种模式：

| 模式 | 什么时候播 |
|---|---|
| 新对话一次 + 钉住的会话每次 | **默认**。新建对话播一次；另外钉住的会话每次进都播 |
| 每个新对话一次 | 只在没说过话的新对话播 |
| 每次打开会话都播 | 切换任何会话都播（最频繁） |
| **每次启动 DSH 只播一次** | 一次启动最多播一次。**「每次打开 DeepSeek 都能看到」选这个** |
| 不自动播放 | 只在你手动点「▶ 预览 / ▶ 播一次」时播 |

- **冷却时间**：距上次播放不足 N 分钟就不自动播（0 = 不限）。它和会话名单是**否决条件**，对以上每种模式都生效。
- **会话名单**：`不限制` / `只在这些会话播` / `这些会话不播`。当前会话可以一键加入或移出。

### 钉住某个会话（让它每次都播）

侧边栏点 **🎞** → 变绿 **🎬** = 已钉住，之后每次进这个会话都播。再点一下取消。

### 换自己的视频

**最省事**：把 mp4 丢进 `~/.dsh/boot-animation-pro/videos/`，点 🎛 →「刷新」→ 点「选它」。

**片库面板**里每条都有：

| 按钮 | 作用 |
|---|---|
| **▶ 预览** | 立刻播这一段，**不改你的选择**（试片用，面板不关，可以连着试） |
| **选它** | 设为以后开片头时播放的片段 |
| **☆ / ★** | 收藏，置顶显示 |
| **改名** | 起个显示名（留空恢复默认） |
| **删除** | 从磁盘删除该文件（会二次确认） |

**手动方式**（仍然有效，host 按此顺序解析，每次请求都重新解析，换片子不用重启）：

| 顺序 | 位置 |
|---|---|
| 1 | 片库里选中的那个 |
| 2 | 环境变量 `DSH_BOOT_ANIMATION` 指向的文件 |
| 3 | `~/.dsh/boot-animation-pro/intro.mp4` |
| 4 | `~/.dsh/boot-animation-pro/videos/` 里最新修改的 |
| 5 | **内嵌的四段**（永远兜得住，因为它在代码里） |

> 上一个版本（`dsh-boot-animation`）的 `~/.dsh/boot-animation/` 目录会被**只读扫描**，
> 所以升级后你原有的片子还在、还能列出来，但本插件不会去删它。

### 播放控制

🎛 →「**播放**」：音量、开片静音、倍速、进度条、倒计时自动跳过、片尾淡出、铺满/完整显示、随机播放。

> **关于声音**：浏览器禁止**带声音**自动播放，所以动画一律**静音起播**。
> **点一下画面**即可开启声音并进入全屏 —— 这是唯一符合浏览器策略的做法。
> 想让它一开始就尝试有声，关掉「开片时静音」；被浏览器拒绝时会显示「点击播放」而不是黑屏。

### 画面美化

🎛 →「**画面**」：标题、副标题、右下角水印，以及 4 种特效 —— 扫描线、暗角、颗粒、辉光。

### 分时段片头

🎛 →「**时段**」：按**星期 + 时间段**自动换片头。命中的第一条启用规则生效；都没命中就走上面的选择/随机。

> **跨午夜**的时间段（例如 `22:00 → 02:00`）算在**开始的星期**上。所以「周五夜」在周六凌晨 1 点依然命中。

### 界面语言

🎛 →「**界面**」：跟随浏览器 / 中文 / English。有闸门（`verify-i18n.mjs`）禁止组件里出现硬编码文案。

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 完全没出现 | 先确认侧边栏有没有 🎞/🎛。有 → 是触发规则问题（见上）；没有 → 缓存，`Cmd+Q` 重开 |
| 停在已有会话不播 | **按设计如此**。默认只在新对话和钉住的会话播；想要「每次打开都看到」选「每次启动 DSH 只播一次」 |
| 有声但听不到 | 静音起播。**点一下画面**开启声音 |
| 黑屏无画面 | 多半是 mp4 的索引表 `moov` 在文件末尾。片库会给这种文件打「⚠ 未优化」徽章；用 `ffmpeg -c copy -movflags +faststart` 无损重排 |
| 播到一半自己没了 | 25 秒看门狗超时 —— 通常还是 faststart 或解码太慢 |
| 想看到插件在干什么 | 把 `src/client/diagnostics.ts` 的 `DEBUG` 改成 `true` 重新构建，控制台会打印每次决策 |

## 开发

```sh
npm run check          # 全部闸门：typecheck + 22 个套件，约 570 条断言
npm run build          # 重新构建 lib/
npm run verify:letterbox   # 用真实浏览器量黑边（需要 Chrome/Edge/Chromium）
```

改代码前请先读 **[ARCHITECTURE.md](ARCHITECTURE.md)** 末尾的**不变量清单**。
其中三条是硬约束，违反了会直接把 GUI 弄挂或造成数据丢失。

## 安全

插件注册在 DSH web 服务器上的路由**不受 app shell 的 web token 保护**。因此**所有会改变状态的接口**
（`/select`、`/remove`）都必须先过 `src/host/route-guard.js` 的四道闸门：

1. `Host` 必须是回环地址 —— 挡 DNS rebinding
2. 拒绝 `Sec-Fetch-Site: cross-site` —— 浏览器自己声明的，网页伪造不了
3. 出现 `Origin` 时必须是回环源 —— 浏览器对每个 POST 都会带
4. `Content-Type` 必须是 `application/json` —— 逼出 CORS 预检

`scripts/verify-route-guard.mjs` 会把攻击原样重放一遍，断言**既要 403、文件又必须还在**。
新增任何写接口时请照抄这个模式。

## 许可

BSD-3-Clause，见 [LICENSE](LICENSE)（与原版逐字节相同，未修改）。
本仓库是 [`NativeDog1/dsh-boot-animation`](https://github.com/NativeDog1/dsh-boot-animation) 的二次开发，
原始著作权归 NativeDog1 所有，详见 [FORK.md](FORK.md)。
