window.__ModuleLoader__.load({
	id: "dsh-boot-animation-pro",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/diagnostics.ts
		/** Bounded, so a retry loop in a render cannot fill the console. */
		const MAX_ENTRIES = 200;
		const entries = [];
		function formatArgs(args) {
			return args.map((a) => {
				if (typeof a === "object" && a !== null) try {
					return JSON.stringify(a);
				} catch {
					return String(a);
				}
				return String(a);
			}).join(" ");
		}
		function narrate(text) {
			try {
				console.log("[dsh-boot-animation-pro] " + text);
			} catch {}
		}
		/** Record one always-on line. Never throws. */
		function notify(...args) {
			const text = formatArgs(args);
			try {
				entries.push(text);
				while (entries.length > MAX_ENTRIES) entries.shift();
			} catch {}
			narrate(text);
		}
		//#endregion
		//#region src/client/i18n.ts
		const ZH = {
			"overlay.loading": "正在加载视频…",
			"overlay.stalled": "视频加载超时",
			"overlay.error": "视频加载失败 —— 控制台有 [dsh-boot-animation-pro] 日志",
			"overlay.skip": "跳过",
			"overlay.skipIn": "{n} 秒后跳过",
			"overlay.tapToPlay": "点击播放",
			"overlay.tapForSound": "点击开启声音 · 全屏",
			"overlay.previewing": "预览中",
			"reason.preview": "预览",
			"reason.new-conversation": "新对话",
			"reason.pinned": "钉住的会话",
			"reason.random": "随机播放",
			"reason.selected": "已选片头",
			"reason.active": "当前片头",
			"reason.explicit": "指定片段",
			"reason.fallback": "回退",
			"reason.schedule": "时段规则",
			"reason.always": "每次打开",
			"reason.startup-only": "本次启动",
			"reason.active-random": "随机播放",
			"pin.title.on": "这个会话已设为片头会话：每次打开都会播放片头动画（点击取消）",
			"pin.title.off": "把这个会话设为片头会话：以后每次打开它都会播放片头动画",
			"pin.title.disabled": "先打开一个对话，才能把它设为片头会话",
			"pin.open": "片头片库：查看、预览、切换或添加片头视频",
			"pin.label": "片头动画",
			"pin.set": "已把这个会话设为片头会话",
			"pin.unset": "已取消这个会话的片头设置",
			"lib.title": "片头片库",
			"lib.intro": "「▶ 预览」立刻播这一段（不改你的选择）；「选它」把它设为以后开片头时播放的片段。",
			"lib.empty": "（还没找到任何视频）",
			"lib.loading": "（正在读取…）",
			"lib.preview": "▶ 预览",
			"lib.preview.title": "立刻播放这一段，不改变你的选择",
			"lib.select": "选它",
			"lib.select.title": "设为以后开片头时播放的片段",
			"lib.selected": "已选",
			"lib.playing": "播放中",
			"lib.previewing": "预览中",
			"lib.rename": "改名",
			"lib.rename.title": "给这一段起个名字（留空恢复默认）",
			"lib.rename.prompt": "显示名称（留空恢复默认）",
			"lib.delete": "删除",
			"lib.delete.title": "从磁盘上删除这个视频文件",
			"lib.delete.confirm": "确定要从磁盘删除这个文件吗？此操作不可撤销：\n\n{file}",
			"lib.favorite.on": "★",
			"lib.favorite.off": "☆",
			"lib.favorite.title": "收藏：置顶显示",
			"lib.badge.legacy": "原片源",
			"lib.badge.copies": "合并 {n} 份重复",
			"lib.badge.copies.title": "这一段在磁盘上有 {n} 份相同的副本，已合并成一条。你的文件没有被删，只是不重复列出。",
			"lib.badge.faststart": "⚠ 未优化",
			"lib.badge.faststart.title": "这个文件的索引表(moov)在末尾：浏览器要整段下载完才出画面，容易黑屏。用 ffmpeg -c copy -movflags +faststart 重排一次即可。",
			"lib.badge.scheduled": "时段",
			"lib.badge.scheduled.title": "有时段规则会用到这一段",
			"lib.badge.readonly": "只读",
			"lib.badge.readonly.title": "这个文件在上一个版本（dsh-boot-animation）的目录里，本插件不会删除它",
			"lib.source.yours": "你自己加的",
			"lib.source.embedded": "插件内置",
			"lib.source.env": "环境变量",
			"lib.source.legacy": "原插件目录",
			"lib.dir.hint": "想加自己的片子：把 mp4 放进这个文件夹，再点「刷新」",
			"lib.playOnce": "▶ 播一次",
			"lib.playOnce.title": "立刻按当前设置播一次",
			"lib.refresh": "刷新",
			"lib.close": "关闭",
			"lib.sort": "排序：",
			"lib.sort.default": "默认",
			"lib.sort.name": "名称",
			"lib.sort.size": "体积",
			"lib.sort.newest": "最新",
			"lib.sort.oldest": "最旧",
			"lib.tab.library": "片库",
			"lib.tab.playback": "播放",
			"lib.tab.trigger": "触发",
			"lib.tab.overlay": "画面",
			"lib.tab.schedule": "时段",
			"lib.tab.interface": "界面",
			"play.fit": "播放方式：",
			"play.fit.cover": "铺满屏幕",
			"play.fit.cover.title": "铺满整个窗口，超出部分裁掉 —— 不留黑边",
			"play.fit.contain": "完整显示",
			"play.fit.contain.title": "完整显示整帧，长宽比不匹配时留黑边",
			"play.random.on": "🎲 随机播放：开",
			"play.random.off": "🎲 随机播放：关",
			"play.random.title": "每次开片头时，从所有可播放的片段里随机挑一段（连续两次不会挑到同一段）",
			"play.volume": "音量",
			"play.muted": "开片时静音",
			"play.muted.title": "浏览器不允许带声音自动播放；关掉这一项后需要点一下画面才有声音",
			"play.rate": "播放速度",
			"play.progress": "显示进度条",
			"play.autoSkip": "自动跳过（秒）",
			"play.autoSkip.title": "开启后画面上会出现倒计时，到点自动关闭；0 表示关闭",
			"play.fade": "片尾淡出（毫秒）",
			"play.fade.title": "播完最后这几毫秒里画面淡出，0 表示直接切断",
			"trigger.mode": "什么时候播",
			"trigger.mode.new-and-pinned": "新对话一次 + 钉住的会话每次",
			"trigger.mode.new-and-pinned.title": "默认行为：每个新对话只播一次，另外你钉住的那个会话每次打开都播",
			"trigger.mode.new-only": "每个新对话一次",
			"trigger.mode.new-only.title": "只在打开一个还没说过话的新对话时播，忽略图钉",
			"trigger.mode.always": "每次打开会话都播",
			"trigger.mode.always.title": "打开任何一个会话都播一遍（切换会话、刷新页面也算）",
			"trigger.mode.startup-only": "每次启动 DSH 只播一次",
			"trigger.mode.startup-only.title": "一次页面加载里最多播一次，之后打开多少会话都不再播",
			"trigger.mode.off": "不自动播放",
			"trigger.mode.off.title": "只在你手动点「▶ 播一次」或「▶ 预览」时播",
			"trigger.cooldown": "冷却时间（分钟）",
			"trigger.cooldown.title": "距离上一次播放不足这么多分钟时不再自动播；0 表示不限制",
			"trigger.list": "会话名单",
			"trigger.list.off": "不限制",
			"trigger.list.allow": "只在这些会话播",
			"trigger.list.deny": "这些会话不播",
			"trigger.list.count": "名单里有 {n} 个会话",
			"trigger.list.add": "把当前会话加进名单",
			"trigger.list.remove": "把当前会话移出名单",
			"trigger.list.none": "当前没有打开的会话，无法加入名单",
			"trigger.list.inList": "当前会话已在名单里",
			"trigger.list.notInList": "当前会话不在名单里",
			"trigger.list.unknown": "未知会话",
			"overlay.field.title": "标题",
			"overlay.field.subtitle": "副标题",
			"overlay.field.watermark": "水印",
			"overlay.field.effect": "画面特效",
			"overlay.field.empty": "留空表示不显示",
			"overlay.title.placeholder": "例如：DeepSeek Harness",
			"overlay.subtitle.placeholder": "例如：系统启动中",
			"overlay.watermark.placeholder": "例如：@Yiheng",
			"overlay.effect.none": "无",
			"overlay.effect.scanlines": "扫描线",
			"overlay.effect.vignette": "暗角",
			"overlay.effect.grain": "颗粒",
			"overlay.effect.glow": "辉光",
			"sched.hint": "按星期和时间段自动换片头：命中第一条启用的规则就用那一段，都没命中就走上面的选择/随机。",
			"sched.wrap": "跨越午夜的时间段（例如 22:00 → 02:00）算在「开始的星期」上。",
			"sched.empty": "还没有时段规则。",
			"sched.add": "为选中的片段加一条",
			"sched.needSelection": "先在「片库」里点「选它」，再加规则",
			"sched.label": "备注",
			"sched.label.placeholder": "可选，例如：周五夜",
			"sched.days": "星期",
			"sched.from": "从",
			"sched.to": "到",
			"sched.enable": "启用",
			"sched.remove": "删除这条",
			"sched.allDays": "每天",
			"sched.ruleOf": "规则 {n}",
			"sched.day.0": "日",
			"sched.day.1": "一",
			"sched.day.2": "二",
			"sched.day.3": "三",
			"sched.day.4": "四",
			"sched.day.5": "五",
			"sched.day.6": "六",
			"ui.locale": "界面语言",
			"ui.locale.auto": "跟随浏览器",
			"ui.locale.zh": "中文",
			"ui.locale.en": "English",
			"ui.version": "插件版本",
			"ui.info": "说明",
			"status.saved": "已保存",
			"status.saveFailed": "保存失败：{error}",
			"status.catalogFailed": "读取片库失败：{error}",
			"status.selected": "已选为片头：{name}",
			"status.randomOn": "已开启随机播放",
			"status.randomOff": "已关闭随机播放",
			"status.fitCover": "已设为「铺满屏幕」",
			"status.fitContain": "已设为「完整显示」",
			"status.removed": "已删除：{name}",
			"status.removeFailed": "删除失败：{error}",
			"status.renamed": "已改名为：{name}",
			"status.renameCleared": "已恢复默认名称",
			"status.ruleAdded": "已新增时段规则",
			"status.ruleRemoved": "已删除时段规则",
			"status.favoriteOn": "已收藏",
			"status.favoriteOff": "已取消收藏",
			"status.sessionAdded": "已把当前会话加进名单",
			"status.sessionRemoved": "已把当前会话移出名单",
			"status.listMode": "会话名单：{mode}",
			"status.busy": "正在保存…"
		};
		const EN = {
			"overlay.loading": "Loading video…",
			"overlay.stalled": "Video load timed out",
			"overlay.error": "Video failed to load — see the [dsh-boot-animation-pro] console log",
			"overlay.skip": "Skip",
			"overlay.skipIn": "Skipping in {n}s",
			"overlay.tapToPlay": "Click to play",
			"overlay.tapForSound": "Click for sound · full screen",
			"overlay.previewing": "previewing",
			"reason.preview": "preview",
			"reason.new-conversation": "new conversation",
			"reason.pinned": "pinned conversation",
			"reason.random": "random",
			"reason.selected": "chosen intro",
			"reason.active": "current intro",
			"reason.explicit": "named clip",
			"reason.fallback": "fallback",
			"reason.schedule": "time rule",
			"reason.always": "every open",
			"reason.startup-only": "this launch",
			"reason.active-random": "random",
			"pin.title.on": "This conversation is the intro conversation: the animation plays every time you open it (click to undo)",
			"pin.title.off": "Make this the intro conversation: the animation will play every time you open it",
			"pin.title.disabled": "Open a conversation first, then you can pin it as the intro conversation",
			"pin.open": "Intro library: browse, preview, switch or add intro videos",
			"pin.label": "Intro animation",
			"pin.set": "This conversation now plays the intro",
			"pin.unset": "This conversation no longer plays the intro",
			"lib.title": "Intro library",
			"lib.intro": "“▶ Preview” plays that clip right now and changes nothing. “Use it” makes it the clip future intros play.",
			"lib.empty": "(no videos found yet)",
			"lib.loading": "(loading…)",
			"lib.preview": "▶ Preview",
			"lib.preview.title": "Play this clip now without changing your choice",
			"lib.select": "Use it",
			"lib.select.title": "Make this the clip future intros play",
			"lib.selected": "In use",
			"lib.playing": "playing",
			"lib.previewing": "previewing",
			"lib.rename": "Rename",
			"lib.rename.title": "Give this clip a display name (empty restores the default)",
			"lib.rename.prompt": "Display name (empty restores the default)",
			"lib.delete": "Delete",
			"lib.delete.title": "Delete this video file from disk",
			"lib.delete.confirm": "Delete this file from disk? This cannot be undone:\n\n{file}",
			"lib.favorite.on": "★",
			"lib.favorite.off": "☆",
			"lib.favorite.title": "Favourite: keep this row at the top",
			"lib.badge.legacy": "legacy drop-in",
			"lib.badge.copies": "{n} duplicates merged",
			"lib.badge.copies.title": "This clip exists as {n} identical copies on disk and is listed once. Nothing was deleted; the duplicates are only hidden.",
			"lib.badge.faststart": "⚠ not optimised",
			"lib.badge.faststart.title": "The index (moov) sits at the end of this file, so the browser must download all of it before the first frame — the usual cause of a black overlay. Fix it with: ffmpeg -c copy -movflags +faststart.",
			"lib.badge.scheduled": "scheduled",
			"lib.badge.scheduled.title": "A time rule plays this clip",
			"lib.badge.readonly": "read-only",
			"lib.badge.readonly.title": "This file lives in the previous version's (dsh-boot-animation) directory; this plugin will not delete it",
			"lib.source.yours": "yours",
			"lib.source.embedded": "built in",
			"lib.source.env": "env var",
			"lib.source.legacy": "old plugin dir",
			"lib.dir.hint": "To add your own clip: drop an mp4 into this folder, then press Refresh",
			"lib.playOnce": "▶ Play once",
			"lib.playOnce.title": "Play one intro right now, using the current settings",
			"lib.refresh": "Refresh",
			"lib.close": "Close",
			"lib.sort": "Sort:",
			"lib.sort.default": "Default",
			"lib.sort.name": "Name",
			"lib.sort.size": "Size",
			"lib.sort.newest": "Newest",
			"lib.sort.oldest": "Oldest",
			"lib.tab.library": "Library",
			"lib.tab.playback": "Playback",
			"lib.tab.trigger": "Trigger",
			"lib.tab.overlay": "Overlay",
			"lib.tab.schedule": "Schedule",
			"lib.tab.interface": "Interface",
			"play.fit": "Fit:",
			"play.fit.cover": "Fill the screen",
			"play.fit.cover.title": "Fill the whole window and crop the overflow — no black bars",
			"play.fit.contain": "Show the whole frame",
			"play.fit.contain.title": "Show the entire frame, letterboxed when the aspect ratio does not match",
			"play.random.on": "🎲 Random: on",
			"play.random.off": "🎲 Random: off",
			"play.random.title": "Play a random clip each time (never the same one twice in a row)",
			"play.volume": "Volume",
			"play.muted": "Start muted",
			"play.muted.title": "Browsers refuse to autoplay with sound. With this off, the audio starts muted and the first click turns it on.",
			"play.rate": "Speed",
			"play.progress": "Show a progress bar",
			"play.autoSkip": "Auto-skip (seconds)",
			"play.autoSkip.title": "Show a countdown and close the overlay when it runs out. 0 turns it off.",
			"play.fade": "Fade out (ms)",
			"play.fade.title": "Fade the last few milliseconds out. 0 cuts straight to the end.",
			"trigger.mode": "When it plays",
			"trigger.mode.new-and-pinned": "New conversation once + pinned every time",
			"trigger.mode.new-and-pinned.title": "The default: each new conversation plays once, plus your pinned conversation every time",
			"trigger.mode.new-only": "Every new conversation once",
			"trigger.mode.new-only.title": "Only when a conversation with no turns is opened; the pin is ignored",
			"trigger.mode.always": "Every time a conversation opens",
			"trigger.mode.always.title": "Plays whenever any conversation is entered, including switching back and reloading",
			"trigger.mode.startup-only": "Once per DSH start",
			"trigger.mode.startup-only.title": "At most one play per page load, whatever you open afterwards",
			"trigger.mode.off": "Never play automatically",
			"trigger.mode.off.title": "Only “▶ Play once” and “▶ Preview” play anything",
			"trigger.cooldown": "Cooldown (minutes)",
			"trigger.cooldown.title": "Do not auto-play again until this many minutes have passed. 0 disables the limit.",
			"trigger.list": "Session list",
			"trigger.list.off": "No restriction",
			"trigger.list.allow": "Only in these sessions",
			"trigger.list.deny": "Never in these sessions",
			"trigger.list.count": "{n} session(s) in the list",
			"trigger.list.add": "Add the current session",
			"trigger.list.remove": "Remove the current session",
			"trigger.list.none": "No conversation is open, so there is nothing to add",
			"trigger.list.inList": "The current session is in the list",
			"trigger.list.notInList": "The current session is not in the list",
			"trigger.list.unknown": "unknown session",
			"overlay.field.title": "Title",
			"overlay.field.subtitle": "Subtitle",
			"overlay.field.watermark": "Watermark",
			"overlay.field.effect": "Effect",
			"overlay.field.empty": "Leave empty to hide",
			"overlay.title.placeholder": "e.g. DeepSeek Harness",
			"overlay.subtitle.placeholder": "e.g. starting up",
			"overlay.watermark.placeholder": "e.g. @Yiheng",
			"overlay.effect.none": "None",
			"overlay.effect.scanlines": "Scanlines",
			"overlay.effect.vignette": "Vignette",
			"overlay.effect.grain": "Grain",
			"overlay.effect.glow": "Glow",
			"sched.hint": "Swap intros by weekday and time of day. The first enabled rule that matches wins; when none matches, the selection or random mode above applies.",
			"sched.wrap": "A window that crosses midnight (e.g. 22:00 → 02:00) counts on the weekday it STARTS.",
			"sched.empty": "No time rules yet.",
			"sched.add": "Add a rule for the chosen clip",
			"sched.needSelection": "Choose a clip with “Use it” in the Library tab first",
			"sched.label": "Note",
			"sched.label.placeholder": "optional, e.g. Friday night",
			"sched.days": "Days",
			"sched.from": "From",
			"sched.to": "To",
			"sched.enable": "Enabled",
			"sched.remove": "Remove this rule",
			"sched.allDays": "Every day",
			"sched.ruleOf": "Rule {n}",
			"sched.day.0": "Sun",
			"sched.day.1": "Mon",
			"sched.day.2": "Tue",
			"sched.day.3": "Wed",
			"sched.day.4": "Thu",
			"sched.day.5": "Fri",
			"sched.day.6": "Sat",
			"ui.locale": "Language",
			"ui.locale.auto": "Follow the browser",
			"ui.locale.zh": "中文",
			"ui.locale.en": "English",
			"ui.version": "Plugin version",
			"ui.info": "About",
			"status.saved": "Saved",
			"status.saveFailed": "Could not save: {error}",
			"status.catalogFailed": "Could not read the library: {error}",
			"status.selected": "Intro set to: {name}",
			"status.randomOn": "Random playback is on",
			"status.randomOff": "Random playback is off",
			"status.fitCover": "Set to “Fill the screen”",
			"status.fitContain": "Set to “Show the whole frame”",
			"status.removed": "Deleted: {name}",
			"status.removeFailed": "Could not delete: {error}",
			"status.renamed": "Renamed to: {name}",
			"status.renameCleared": "Back to the default name",
			"status.ruleAdded": "Time rule added",
			"status.ruleRemoved": "Time rule removed",
			"status.favoriteOn": "Added to favourites",
			"status.favoriteOff": "Removed from favourites",
			"status.sessionAdded": "Added the current session to the list",
			"status.sessionRemoved": "Removed the current session from the list",
			"status.listMode": "Session list: {mode}",
			"status.busy": "Saving…"
		};
		const DICTIONARIES = {
			zh: ZH,
			en: EN
		};
		/**
		* The language to render in.
		*
		* `auto` reads the browser's own preference. The lookup is wrapped because the
		* client bundle is also evaluated where there is no `navigator` at all, and a
		* decorative plugin must not fail to load over a language guess.
		*
		* @param {Locale} setting the stored preference
		* @param {string | undefined} [browserLanguage] override, for tests
		*/
		function resolveLocale(setting, browserLanguage) {
			if (setting === "zh" || setting === "en") return setting;
			const candidate = browserLanguage ?? (() => {
				try {
					return typeof navigator === "undefined" ? void 0 : navigator.language;
				} catch {
					return;
				}
			})();
			return typeof candidate === "string" && candidate.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
		/** Substitute `{name}` placeholders. An unknown placeholder is left visible. */
		function formatMessage(template, params) {
			if (params === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (whole, key) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole);
		}
		function translatorFor(locale) {
			const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.zh;
			return (key, params) => formatMessage(dictionary[key] ?? key, params);
		}
		/** Both dictionaries, so a test can prove they define exactly the same keys. */
		const CATALOGS = {
			zh: ZH,
			en: EN
		};
		//#endregion
		//#region src/client/store.ts
		/**
		* ClientStore — the client's ONE source of truth.
		*
		* The version this fork came from kept this state in four unrelated places: a
		* module-level `activeVersion` fetched once per page, a `src` frozen with
		* `useState` at overlay mount, the library's own local list, and a `fit` value
		* that lived only in localStorage. Nothing could answer "which clip is playing
		* right now", which is why selecting B could keep playing A until a reload.
		*
		* Here every one of those is one field on one object, and the three clip
		* identities are deliberately NOT the same field:
		*
		*   settings.selectedClipId      what the user chose; changes ONLY on selectClip()
		*   playback.clipId              what the <video> element is being pointed at
		*   playback.previewClipId       what the last preview asked for (may equal
		*                                neither of the others, and never persists)
		*
		* Every setting the host understands is mirrored here, and the ONLY way this
		* store changes one is by asking the host to change it and then re-reading the
		* host's answer. The client never invents a settings value: a write that the host
		* refuses leaves the panel showing what is actually on disk, which is the
		* difference between "saved" and "looked saved".
		*
		* A mutation replaces the snapshot object, so `useSyncExternalStore` sees a new
		* reference exactly when something changed — and never otherwise.
		*
		* `playback.nonce` increments on every play request. Without it, asking to play
		* the same clip twice would be a no-op for React (same clipId, same url), and a
		* replay button that does nothing is the bug this guards against.
		*/
		/**
		* The enumerations the panel renders, as the client knows them.
		*
		* These are mirrored in `src/host/settings.js`. Duplicating them buys typed
		* rendering in the panel; `scripts/verify-settings.mjs` compares the two lists and
		* fails the build's check command if they ever drift.
		*/
		const FIT_MODES = ["cover", "contain"];
		const TRIGGER_MODES = [
			"new-and-pinned",
			"new-only",
			"always",
			"startup-only",
			"off"
		];
		const SORT_MODES = [
			"default",
			"name",
			"size",
			"newest",
			"oldest"
		];
		const OVERLAY_EFFECTS = [
			"none",
			"scanlines",
			"vignette",
			"grain",
			"glow"
		];
		const LOCALES = [
			"auto",
			"zh",
			"en"
		];
		const SESSION_LIST_MODES = [
			"off",
			"allow",
			"deny"
		];
		/** The bounds the sliders and number inputs use, matching the host's clamps. */
		const VOLUME_RANGE = [0, 1];
		const RATE_RANGE = [.25, 2];
		const AUTO_SKIP_RANGE = [0, 60];
		const COOLDOWN_RANGE = [0, 1440];
		const FADE_RANGE = [0, 3e3];
		const BASE = "/dsh-boot-animation-pro";
		const LIST_URL = `${BASE}/videos.json`;
		const SELECT_URL = `${BASE}/select`;
		const REMOVE_URL = `${BASE}/remove`;
		const RESOLVE_URL = `${BASE}/resolve.json`;
		/** The client's defaults. Spelled out so a missing host field has a real value. */
		const DEFAULT_SETTINGS = {
			version: 3,
			selectedClipId: null,
			randomPlayback: false,
			fitMode: "cover",
			volume: 1,
			muted: true,
			playbackRate: 1,
			showProgress: true,
			autoSkipSeconds: 0,
			fadeOutMs: 400,
			triggerMode: "new-and-pinned",
			cooldownMinutes: 0,
			sessionList: {
				mode: "off",
				ids: []
			},
			aliases: {},
			favorites: [],
			sortMode: "default",
			overlayTitle: "",
			overlaySubtitle: "",
			watermark: "",
			overlayEffect: "none",
			timeRules: [],
			locale: "auto"
		};
		const IDLE_PLAYBACK = {
			clipId: null,
			previewClipId: null,
			url: null,
			phase: "idle",
			reason: "none",
			nonce: 0,
			message: null
		};
		const EMPTY_STATUS = {
			key: null,
			params: {},
			kind: ""
		};
		function asBoolean(value, fallback) {
			return typeof value === "boolean" ? value : fallback;
		}
		function asNumber(value, fallback, [min, max]) {
			if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
			return Math.min(max, Math.max(min, value));
		}
		function asEnum(value, allowed, fallback) {
			return typeof value === "string" && allowed.includes(value) ? value : fallback;
		}
		function asText(value, fallback = "") {
			return typeof value === "string" ? value : fallback;
		}
		function asStringList(value) {
			return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
		}
		function asTimeRules(value) {
			if (!Array.isArray(value)) return [];
			const rules = [];
			for (const raw of value) {
				if (raw === null || typeof raw !== "object") continue;
				const rule = raw;
				if (typeof rule.id !== "string" || typeof rule.clipId !== "string") continue;
				if (typeof rule.start !== "string" || typeof rule.end !== "string") continue;
				rules.push({
					id: rule.id,
					clipId: rule.clipId,
					label: asText(rule.label),
					days: Array.isArray(rule.days) ? rule.days.filter((day) => typeof day === "number") : [],
					start: rule.start,
					end: rule.end,
					enabled: rule.enabled !== false
				});
			}
			return rules;
		}
		/**
		* A settings object from whatever the host sent.
		*
		* This is a WIRE boundary, so it validates rather than trusting the static type:
		* the payload is JSON from an HTTP response, and a field the host added later
		* must not be able to put a `NaN` into a slider.
		*/
		function normaliseSettings(raw, fallback = DEFAULT_SETTINGS) {
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
			const source = raw;
			const list = source.sessionList;
			const sessionList = list !== null && typeof list === "object" && !Array.isArray(list) ? list : {};
			return {
				version: typeof source.version === "number" ? source.version : fallback.version,
				selectedClipId: typeof source.selectedClipId === "string" ? source.selectedClipId : null,
				randomPlayback: asBoolean(source.randomPlayback, fallback.randomPlayback),
				fitMode: asEnum(source.fitMode, FIT_MODES, fallback.fitMode),
				volume: asNumber(source.volume, fallback.volume, VOLUME_RANGE),
				muted: asBoolean(source.muted, fallback.muted),
				playbackRate: asNumber(source.playbackRate, fallback.playbackRate, RATE_RANGE),
				showProgress: asBoolean(source.showProgress, fallback.showProgress),
				autoSkipSeconds: asNumber(source.autoSkipSeconds, fallback.autoSkipSeconds, AUTO_SKIP_RANGE),
				fadeOutMs: asNumber(source.fadeOutMs, fallback.fadeOutMs, FADE_RANGE),
				triggerMode: asEnum(source.triggerMode, TRIGGER_MODES, fallback.triggerMode),
				cooldownMinutes: asNumber(source.cooldownMinutes, fallback.cooldownMinutes, COOLDOWN_RANGE),
				sessionList: {
					mode: asEnum(sessionList.mode, SESSION_LIST_MODES, fallback.sessionList.mode),
					ids: asStringList(sessionList.ids)
				},
				aliases: source.aliases !== null && typeof source.aliases === "object" && !Array.isArray(source.aliases) ? Object.fromEntries(Object.entries(source.aliases).filter((entry) => typeof entry[1] === "string")) : {},
				favorites: asStringList(source.favorites),
				sortMode: asEnum(source.sortMode, SORT_MODES, fallback.sortMode),
				overlayTitle: asText(source.overlayTitle),
				overlaySubtitle: asText(source.overlaySubtitle),
				watermark: asText(source.watermark),
				overlayEffect: asEnum(source.overlayEffect, OVERLAY_EFFECTS, fallback.overlayEffect),
				timeRules: asTimeRules(source.timeRules),
				locale: asEnum(source.locale, LOCALES, fallback.locale)
			};
		}
		/**
		* The media URL for one clip.
		*
		* Addressed by ClipId, with the clip's own content identity pinned as `?v=`.
		* That is what makes "select A, then B, then C" deterministic without a reload:
		* every clip is a different resource, so nothing can be served from the previous
		* clip's cache entry, and a pinned URL is immutable because it cannot go stale.
		*/
		function mediaUrlFor(clip) {
			const path = clip.mediaUrl ?? `${BASE}/media/${encodeURIComponent(clip.id)}`;
			const version = clip.version;
			return typeof version === "string" && version !== "" ? `${path}?v=${encodeURIComponent(version)}` : path;
		}
		var ClientStore = class {
			#snapshot = {
				catalog: null,
				settings: { ...DEFAULT_SETTINGS },
				playback: IDLE_PLAYBACK,
				loading: false,
				busy: false,
				status: EMPTY_STATUS
			};
			#listeners = /* @__PURE__ */ new Set();
			subscribe = (listener) => {
				this.#listeners.add(listener);
				return () => {
					this.#listeners.delete(listener);
				};
			};
			getSnapshot = () => this.#snapshot;
			#set(patch) {
				this.#snapshot = {
					...this.#snapshot,
					...patch
				};
				for (const listener of this.#listeners) try {
					listener();
				} catch {}
			}
			/** Read the library and the settings from the host. Safe to call repeatedly. */
			async loadCatalog() {
				this.#set({ loading: true });
				try {
					const response = await fetch(LIST_URL, { cache: "no-store" });
					if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
					const data = await response.json();
					/**
					* The host sends the whole settings object under `settings`. The three flat
					* fields beside it are the pre-1.0 wire format, kept readable so a stub or
					* an older host still yields a complete settings object instead of defaults.
					*/
					const flat = {
						selectedClipId: data.selectedClipId,
						randomPlayback: data.randomPlayback,
						fitMode: data.fitMode
					};
					const settings = normaliseSettings(data.settings ?? flat, this.#snapshot.settings);
					this.#set({
						catalog: {
							clips: Array.isArray(data.videos) ? data.videos : [],
							userDir: typeof data.userDir === "string" ? data.userDir : "",
							accepts: Array.isArray(data.accepts) ? data.accepts : []
						},
						settings,
						loading: false,
						status: EMPTY_STATUS
					});
					data.videos?.length;
				} catch (error) {
					notify("catalog load failed", String(error));
					this.#set({
						loading: false,
						status: {
							key: "status.catalogFailed",
							params: { error: String(error) },
							kind: "dbap-err"
						}
					});
				}
			}
			/**
			* Save one patch and adopt the host's answer.
			*
			* THE only write path. Everything the panel can change goes through here, so
			* there is exactly one place that decides what "the settings are now" means,
			* and it is the host's reply rather than the browser's optimism.
			*
			* @param patch the `POST /select` body
			* @param okKey the status message shown when the host accepts
			*/
			async save(patch, okKey, okParams = {}) {
				this.#set({
					busy: true,
					status: {
						key: "status.busy",
						params: {},
						kind: ""
					}
				});
				try {
					const data = await (await fetch(SELECT_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(patch)
					})).json();
					if (data.ok !== true) {
						this.#set({
							busy: false,
							status: {
								key: "status.saveFailed",
								params: { error: String(data.error ?? "") },
								kind: "dbap-err"
							}
						});
						return false;
					}
					this.#set({
						busy: false,
						settings: normaliseSettings(data.settings, this.#snapshot.settings),
						status: {
							key: okKey,
							params: okParams,
							kind: "dbap-ok"
						}
					});
					await this.loadCatalog();
					this.#set({ status: {
						key: okKey,
						params: okParams,
						kind: "dbap-ok"
					} });
					return true;
				} catch (error) {
					this.#set({
						busy: false,
						status: {
							key: "status.saveFailed",
							params: { error: String(error) },
							kind: "dbap-err"
						}
					});
					return false;
				}
			}
			/** Choose a clip. The ONLY method that changes `settings.selectedClipId`. */
			async selectClip(clipId) {
				const clip = this.clip(clipId);
				return this.save({ selectedClipId: clipId }, "status.selected", { name: clip?.name ?? clipId });
			}
			async setRandomPlayback(on) {
				return this.save({ randomPlayback: on }, on ? "status.randomOn" : "status.randomOff");
			}
			async setFitMode(mode) {
				return this.save({ fitMode: mode }, mode === "cover" ? "status.fitCover" : "status.fitContain");
			}
			/** Rename one row. An empty name restores the name derived from the file. */
			async renameClip(clipId, name) {
				const trimmed = name.trim();
				return this.save({ alias: {
					clipId,
					name: trimmed
				} }, trimmed === "" ? "status.renameCleared" : "status.renamed", { name: trimmed });
			}
			async toggleFavorite(clipId) {
				const on = !(this.clip(clipId)?.favorite ?? false);
				return this.save({ toggleFavorite: clipId }, on ? "status.favoriteOn" : "status.favoriteOff");
			}
			/**
			* Delete one of the user's own files.
			*
			* Deliberately a separate route from `/select`: this is the only call in the
			* plugin that destroys something the user made, so it gets its own endpoint and
			* its own failure message instead of travelling as one more settings patch.
			*/
			async removeClip(clipId) {
				const clip = this.clip(clipId);
				this.#set({
					busy: true,
					status: {
						key: "status.busy",
						params: {},
						kind: ""
					}
				});
				try {
					const data = await (await fetch(REMOVE_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ clipId })
					})).json();
					if (data.ok !== true) {
						this.#set({
							busy: false,
							status: {
								key: "status.removeFailed",
								params: { error: String(data.error ?? "") },
								kind: "dbap-err"
							}
						});
						return false;
					}
					await this.loadCatalog();
					this.#set({
						busy: false,
						status: {
							key: "status.removed",
							params: { name: clip?.name ?? clipId },
							kind: "dbap-ok"
						}
					});
					return true;
				} catch (error) {
					this.#set({
						busy: false,
						status: {
							key: "status.removeFailed",
							params: { error: String(error) },
							kind: "dbap-err"
						}
					});
					return false;
				}
			}
			/** One clip from the loaded catalog. */
			clip(clipId) {
				const catalog = this.#snapshot.catalog;
				if (catalog === null) return null;
				return catalog.clips.find((item) => item.id === clipId) ?? null;
			}
			setStatus(key, kind, params = {}) {
				this.#set({ status: {
					key,
					params,
					kind
				} });
			}
			/** The language the panel renders in, given the stored preference. */
			localeSetting() {
				return this.#snapshot.settings.locale;
			}
			/**
			* Point the player at one clip. THE playback entry point.
			*
			* `reason` is recorded so diagnostics can say why this clip is playing
			* ('preview', 'new-conversation', 'pinned', 'random', 'schedule'), and every
			* caller — preview, new conversation, pinned session, schedule, random —
			* arrives here.
			*/
			playClip(clipId, reason) {
				const clip = this.clip(clipId);
				if (clip === null) {
					notify("play requested for an unknown clip", {
						clipId,
						reason
					});
					return false;
				}
				const playback = this.#snapshot.playback;
				this.#set({ playback: {
					...playback,
					clipId,
					url: mediaUrlFor(clip),
					phase: "loading",
					reason,
					nonce: playback.nonce + 1,
					message: null
				} });
				notify("play", {
					clipId,
					reason,
					url: mediaUrlFor(clip)
				});
				return true;
			}
			/**
			* Ask the host which clip should play in a given mode, then play it.
			*
			* The client never decides this itself: `selected`, `active` (which honours
			* time rules, then random playback) and `random` are all answered by the host's
			* ClipResolver, so there is exactly one implementation of the priority chain
			* and one of the "do not repeat" rule. If the host cannot be reached, this
			* degrades to whatever the catalog already knows rather than failing.
			*/
			async playMode(mode, reason) {
				try {
					const response = await fetch(`${RESOLVE_URL}?mode=${mode}`, { cache: "no-store" });
					if (response.ok) {
						const data = await response.json();
						if (typeof data.clipId === "string" && data.clipId !== "") {
							const how = typeof data.how === "string" ? data.how : "";
							/**
							* The caller's reason wins, because it knows the trigger ("a pinned
							* conversation was opened") while the host only knows the mode ("the
							* stored selection"). A time-rule hit is the exception: it is a fact
							* about the clip that the caller cannot see.
							*/
							const effective = how === "schedule" ? "schedule" : reason !== "" ? reason : how === "" ? "active" : how;
							return this.playClip(data.clipId, effective);
						}
					}
					notify("resolve fell back to the catalog", { mode });
				} catch (error) {
					notify("resolve failed", String(error));
				}
				const settings = this.#snapshot.settings;
				if (settings.randomPlayback) {
					const pool = this.#snapshot.catalog?.clips ?? [];
					if (pool.length > 0) return this.playClip(pool[0].id, "fallback");
					return false;
				}
				if (settings.selectedClipId !== null) return this.playClip(settings.selectedClipId, "fallback");
				return false;
			}
			/**
			* Preview one specific clip.
			*
			* Records `previewClipId` so the UI can mark what is being auditioned, and
			* plays it — without touching the selection. Previewing B while A is selected
			* must show B and leave A selected.
			*/
			preview(clipId, reason = "preview") {
				const played = this.playClip(clipId, reason);
				if (played) this.#set({ playback: {
					...this.#snapshot.playback,
					previewClipId: clipId
				} });
				return played;
			}
			/** Report the phase the <video> element reached. */
			setPhase(phase, message = null) {
				if (this.#snapshot.playback.phase === phase && this.#snapshot.playback.message === message) return;
				this.#set({ playback: {
					...this.#snapshot.playback,
					phase,
					message
				} });
			}
			/** Stop playback (overlay closed, ended, or skipped). */
			stop() {
				const playback = this.#snapshot.playback;
				if (playback.phase === "idle" && playback.clipId === null) return;
				this.#set({ playback: {
					...playback,
					phase: "idle",
					clipId: null,
					url: null,
					message: null
				} });
			}
		};
		/** The store as React sees it, without the component that used to own it. */
		function useClientStore(store) {
			return (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* The stylesheet, injected once.
		*
		* Kept in its own module so `scripts/check-css-template.mjs` has one obvious
		* place to guard: the sheet is a template literal, and a stray backtick inside
		* it ends the literal and breaks the build in a way that leaves the previous
		* bundle in place — which once shipped silently.
		*
		* The layout note is load-bearing: the two fit modes differ ONLY by `object-fit`.
		* An earlier "improvement" that also rewrote the layout mechanics took the overlay
		* fully black in the real app, so it was reverted and is not to be retried. Every
		* decoration added since — captions, watermark, progress bar, the effects layer —
		* is a SEPARATE absolutely-positioned child, so none of them touches the video's
		* own sizing.
		*/
		const STYLE_ID = "dsh-boot-animation-pro-style";
		const CSS = `
.dbap-root{position:fixed;inset:0;z-index:2147483000;background:#000;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;cursor:pointer;overflow:hidden;
  transition:opacity .36s ease}
.dbap-root.dbap-fading{opacity:0}
.dbap-video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
/* The ONLY difference between the fit modes is object-fit.
   Do not "harden" this with position/inset changes: the bar fix does not need
   them, and an overlay that rendered correctly under flex + percentage sizing
   went fully black in the real app the one time the layout mechanics were
   rewritten for no reason. Minimal change, or you trade a cosmetic defect for a
   functional one.
   NOTE: never put a backtick in this block — the whole sheet is a template
   literal, and one backtick ends it. scripts/check-css-template.mjs enforces it. */
.dbap-video.dbap-cover{object-fit:cover;object-position:center}

/* Decoration. One absolutely-positioned layer, aria-hidden by construction:
   it never receives the pointer, so every click still reaches the overlay. */
.dbap-fx{position:absolute;inset:0;z-index:1;pointer-events:none}
.dbap-fx-scanlines{background:repeating-linear-gradient(180deg,
  rgba(255,255,255,.055) 0 1px, rgba(0,0,0,0) 1px 3px);
  mix-blend-mode:overlay}
.dbap-fx-vignette{background:radial-gradient(ellipse at center,
  rgba(0,0,0,0) 42%, rgba(0,0,0,.72) 100%)}
.dbap-fx-grain{opacity:.16;
  background-image:radial-gradient(rgba(255,255,255,.9) .5px, rgba(0,0,0,0) .5px),
    radial-gradient(rgba(255,255,255,.7) .5px, rgba(0,0,0,0) .5px);
  background-size:3px 3px, 5px 5px;background-position:0 0, 2px 1px}
.dbap-fx-glow{box-shadow:inset 0 0 140px rgba(96,178,255,.30), inset 0 0 40px rgba(0,0,0,.55)}

.dbap-caption{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
  z-index:2;text-align:center;pointer-events:none;max-width:82vw;
  font-family:inherit;text-shadow:0 2px 18px rgba(0,0,0,.92)}
.dbap-caption-title{font-size:clamp(22px,3.4vw,44px);font-weight:600;
  letter-spacing:.06em;color:rgba(255,255,255,.96)}
.dbap-caption-sub{margin-top:6px;font-size:clamp(12px,1.3vw,17px);
  letter-spacing:.22em;color:rgba(255,255,255,.72)}
.dbap-watermark{position:absolute;right:22px;bottom:22px;z-index:2;
  pointer-events:none;font-family:inherit;font-size:12.5px;letter-spacing:.08em;
  color:rgba(255,255,255,.5);text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dbap-progress{position:absolute;left:0;right:0;bottom:0;height:3px;z-index:3;
  background:rgba(255,255,255,.14);pointer-events:none}
.dbap-progress i{display:block;height:100%;width:0;
  background:linear-gradient(90deg,rgba(96,178,255,.95),rgba(7,193,96,.95));
  transition:width .18s linear}

.dbap-skip{position:absolute;top:20px;right:22px;z-index:4;
  border:1px solid rgba(255,255,255,.42);background:rgba(0,0,0,.42);
  color:#fff;border-radius:999px;padding:6px 16px;font-size:13px;line-height:1.4;
  font-family:inherit;cursor:pointer}
.dbap-skip:hover{background:rgba(0,0,0,.66)}
.dbap-hint{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);
  z-index:2;color:rgba(255,255,255,.82);font-size:13px;letter-spacing:.06em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9);
  animation:dbap-breathe 2.4s ease-in-out infinite;white-space:nowrap}
@keyframes dbap-breathe{0%,100%{opacity:.55}50%{opacity:1}}
.dbap-status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  z-index:2;color:rgba(255,255,255,.88);font-size:14px;letter-spacing:.04em;
  font-family:inherit;text-align:center;max-width:78vw;
  background:rgba(0,0,0,.46);border-radius:10px;padding:10px 18px;
  text-shadow:0 1px 10px rgba(0,0,0,.9)}
.dbap-what{position:absolute;top:20px;left:22px;z-index:2;
  color:rgba(255,255,255,.72);font-size:12px;letter-spacing:.04em;
  font-family:inherit;text-shadow:0 1px 8px rgba(0,0,0,.9)}

.dbap-pin{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:8px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-text-secondary,#888);
  font-size:14px;line-height:1;font-family:inherit}
.dbap-pin:hover{background:rgba(127,127,127,.16);color:var(--dsw-alias-text-primary,#191919)}
.dbap-pin.dbap-pin-on{color:#07c160;background:rgba(7,193,96,.14)}
.dbap-pin[disabled]{opacity:.4;cursor:default}

.dbap-veil{position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.46);
  display:flex;align-items:center;justify-content:center;padding:24px}
.dbap-lib{width:min(760px,100%);max-height:min(86vh,760px);
  display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-text-primary,#191919);
  border:1px solid rgba(127,127,127,.28);border-radius:14px;padding:16px 18px 12px;
  box-shadow:0 18px 60px rgba(0,0,0,.34);font-family:inherit;
  font-size:13px;line-height:1.55}
.dbap-lib h3{margin:0 0 10px;font-size:15px;font-weight:600}
.dbap-lib p{margin:0 0 10px;color:var(--dsw-alias-text-secondary,#777);font-size:12.5px}
.dbap-tabs{display:flex;gap:4px;flex-wrap:wrap;
  border-bottom:1px solid rgba(127,127,127,.22);margin-bottom:12px}
.dbap-tab{border:0;background:transparent;color:inherit;font-family:inherit;
  font-size:12.5px;padding:6px 12px;cursor:pointer;border-radius:8px 8px 0 0;
  border-bottom:2px solid transparent;margin-bottom:-1px}
.dbap-tab:hover{background:rgba(127,127,127,.10)}
.dbap-tab.dbap-tab-on{color:#07974b;font-weight:600;
  border-bottom-color:rgba(7,193,96,.85)}
.dbap-body{flex:1;min-height:0;overflow:auto;padding-right:2px}

.dbap-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:9px;
  border:1px solid transparent}
.dbap-item:hover{background:rgba(127,127,127,.10)}
.dbap-item.dbap-cur{border-color:rgba(7,193,96,.55);background:rgba(7,193,96,.10)}
.dbap-item .dbap-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbap-badge{font-size:11px;padding:1px 7px;border-radius:999px;
  background:rgba(127,127,127,.18);color:var(--dsw-alias-text-secondary,#777);white-space:nowrap}
.dbap-badge.dbap-b-sel{background:rgba(7,193,96,.16);color:#07974b}
.dbap-badge.dbap-b-prev{background:rgba(64,140,255,.18);color:#2c6bd6}
.dbap-badge.dbap-b-warn{background:rgba(210,120,40,.18);color:#b46214;cursor:help}
.dbap-meta{font-size:11.5px;color:var(--dsw-alias-text-secondary,#999);white-space:nowrap}
.dbap-dim{opacity:.78}
.dbap-mark{width:14px;text-align:center;color:#07c160;font-weight:700;font-size:12px}
.dbap-row-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:7px;padding:3px 10px;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap}
.dbap-row-btn:hover{background:rgba(127,127,127,.14)}
.dbap-row-btn.dbap-go{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dbap-row-btn.dbap-danger:hover{border-color:rgba(192,57,43,.6);color:#c0392b;
  background:rgba(192,57,43,.10)}
.dbap-row-btn.dbap-star{width:26px;padding:3px 0;text-align:center;color:#d0a020}
.dbap-row-btn.dbap-star-on{border-color:rgba(208,160,32,.6);background:rgba(208,160,32,.14)}

.dbap-dir{margin:12px 0 0;padding:9px 10px;border-radius:9px;background:rgba(127,127,127,.10);
  font-size:11.5px;color:var(--dsw-alias-text-secondary,#777);word-break:break-all}
.dbap-dir code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  color:var(--dsw-alias-text-primary,#333)}
.dbap-bar{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;
  padding-top:10px;border-top:1px solid rgba(127,127,127,.18)}
.dbap-btn{border:1px solid rgba(127,127,127,.34);background:transparent;color:inherit;
  border-radius:8px;padding:5px 14px;font-size:12.5px;font-family:inherit;cursor:pointer}
.dbap-btn:hover{background:rgba(127,127,127,.14)}
.dbap-btn[disabled]{opacity:.5;cursor:default}
.dbap-btn.dbap-btn-on{border-color:rgba(7,193,96,.6);background:rgba(7,193,96,.12);color:#07974b}
.dbap-btn.dbap-go{border-color:rgba(7,193,96,.55);color:#07974b;font-weight:600}
.dbap-btn.dbap-danger:hover{border-color:rgba(192,57,43,.6);color:#c0392b;
  background:rgba(192,57,43,.10)}
.dbap-btn.dbap-wide{display:block;width:100%;text-align:left;margin-bottom:6px}
.dbap-msg{margin-top:8px;font-size:12px;min-height:16px;
  color:var(--dsw-alias-text-secondary,#777)}
.dbap-msg.dbap-err{color:#c0392b}
.dbap-msg.dbap-ok{color:#07974b}

.dbap-choice{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;
  margin-bottom:10px;font-size:12px;
  color:var(--dsw-alias-text-secondary,#777)}
.dbap-choice.dbap-wrap{flex-wrap:wrap}
.dbap-choice-label{flex:0 0 auto;margin-right:2px}
.dbap-stack{display:flex;flex-direction:column;gap:0;margin-bottom:12px}
.dbap-sort{margin-bottom:12px}
.dbap-field{display:flex;align-items:center;gap:10px;margin-bottom:10px;
  font-size:12.5px;color:var(--dsw-alias-text-secondary,#777)}
.dbap-field-label{flex:0 0 auto;min-width:120px}
.dbap-field-label em{font-style:normal;opacity:.72;font-size:11.5px}
.dbap-input{border:1px solid rgba(127,127,127,.34);border-radius:8px;
  background:var(--dsw-alias-bg-elevated,#fff);color:inherit;
  font-family:inherit;font-size:12.5px;padding:4px 9px;min-width:0;flex:1}
.dbap-input.dbap-num{flex:0 0 96px;width:96px}
.dbap-input.dbap-time{flex:0 0 104px;width:104px}
.dbap-input.dbap-inline-rename{flex:1;min-width:0}
.dbap-range{flex:1;min-width:80px}
.dbap-toggle{display:inline-flex;align-items:center;gap:7px;margin:0 14px 10px 0;
  font-size:12.5px;color:var(--dsw-alias-text-secondary,#777);cursor:pointer}
.dbap-toggle input{cursor:pointer}

.dbap-rule{border:1px solid rgba(127,127,127,.24);border-radius:10px;
  padding:8px 10px;margin-bottom:8px;background:rgba(127,127,127,.05)}
.dbap-rule.dbap-rule-off{opacity:.55}
.dbap-rule.dbap-rule-new{border-style:dashed;background:transparent}
.dbap-rule-top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.dbap-rule-top .dbap-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}
.dbap-rule-bottom{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.dbap-rule-label{flex:1;min-width:120px}
.dbap-day{width:30px;padding:4px 0;text-align:center}
.dbap-about{margin:6px 0 0;font-size:12px;color:var(--dsw-alias-text-secondary,#777)}
.dbap-about dt{font-weight:600;color:var(--dsw-alias-text-primary,#333)}
.dbap-about dd{margin:2px 0 0}
.dbap-about code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;
  word-break:break-all}
`;
		/** Inject the sheet once per document. */
		function ensureStyle() {
			try {
				if (document.getElementById("dsh-boot-animation-pro-style") !== null) return;
				const style = document.createElement("style");
				style.id = STYLE_ID;
				style.textContent = CSS;
				document.head.appendChild(style);
			} catch {}
		}
		//#endregion
		//#region src/client/ui-overlay.ts
		/** How long a play attempt may show black before the overlay gives up. */
		const STALL_TIMEOUT_MS = 25e3;
		/** How long an error stays readable before the overlay closes itself. */
		const ERROR_LINGER_MS = 8e3;
		/** Keys that dismiss the overlay, by `KeyboardEvent.key`. */
		const SKIP_KEYS = /* @__PURE__ */ new Set([
			"Escape",
			" ",
			"Spacebar",
			"Enter"
		]);
		/**
		* Whether the overlay listens for skip keys right now.
		*
		* The picker is a separate React root over the same window, so it cannot stop the
		* overlay's listener by ordering. It flips this flag instead while it is open,
		* which is what keeps Escape from meaning "close the dialog" AND "skip the video"
		* at the same time.
		*/
		let skipKeysEnabled = true;
		/** Turn the overlay's keyboard shortcuts on or off. */
		function setSkipKeysEnabled(enabled) {
			skipKeysEnabled = enabled;
		}
		/**
		* Stop a media element completely when the overlay leaves the tree.
		*
		* Detaching a <video> from the DOM does not stop it: HMR, disabling the plugin,
		* or a slot remount all unmount the overlay while the element keeps playing and
		* holding a decoder. `load()` aborts the pending media fetch and releases the
		* decoder.
		*
		* Exported so `scripts/verify-teardown.mjs` exercises THIS shipped function.
		*/
		function releaseVideo(video) {
			try {
				video.pause();
				video.currentTime = 0;
				video.removeAttribute("src");
				video.load();
			} catch {}
		}
		/** The decorative class for one effect, or null for "none". */
		function effectClass(effect) {
			return effect === "none" ? null : `dbap-fx-${effect}`;
		}
		function BootOverlay({ store }) {
			ensureStyle();
			const snapshot = useClientStore(store);
			const { url, nonce, phase, clipId, reason, previewClipId } = snapshot.playback;
			const settings = snapshot.settings;
			const t = (0, react.useMemo)(() => translatorFor(resolveLocale(settings.locale)), [settings.locale]);
			const [needsTap, setNeedsTap] = (0, react.useState)(false);
			const [progress, setProgress] = (0, react.useState)(0);
			const [remaining, setRemaining] = (0, react.useState)(null);
			const [fading, setFading] = (0, react.useState)(false);
			const videoRef = (0, react.useRef)(null);
			const closedRef = (0, react.useRef)(false);
			const close = (0, react.useCallback)(() => {
				closedRef.current = true;
				const video = videoRef.current;
				if (video !== null) try {
					video.pause();
				} catch {}
				if (document.fullscreenElement !== null && document.exitFullscreen !== void 0) document.exitFullscreen().catch(() => {});
				store.stop();
			}, [store]);
			/** The close that a fade-out uses: hold the last frame, then leave. */
			const finishWithFade = (0, react.useCallback)(() => {
				if (closedRef.current) return;
				if (settings.fadeOutMs <= 0) {
					close();
					return;
				}
				setFading(true);
				window.setTimeout(() => {
					if (!closedRef.current) close();
				}, settings.fadeOutMs);
			}, [close, settings.fadeOutMs]);
			(0, react.useEffect)(() => {
				if (url === null) return void 0;
				const video = videoRef.current;
				if (video === null) return void 0;
				closedRef.current = false;
				setNeedsTap(false);
				setProgress(0);
				setFading(false);
				setRemaining(settings.autoSkipSeconds > 0 ? settings.autoSkipSeconds : null);
				video.muted = true;
				video.volume = Math.min(1, Math.max(0, settings.volume));
				video.playbackRate = Math.min(2, Math.max(.25, settings.playbackRate));
				const startedAt = performance.now();
				/** One line carrying everything a black-frame report needs. */
				const report = (label) => notify(label, {
					ms: Math.round(performance.now() - startedAt),
					clipId,
					reason,
					readyState: video.readyState,
					networkState: video.networkState,
					src: video.currentSrc || video.src
				});
				const onPlaying = () => {
					store.setPhase("playing");
					report("first frame painted");
				};
				const onTimeUpdate = () => {
					const total = video.duration;
					setProgress(Number.isFinite(total) && total > 0 ? Math.min(1, video.currentTime / total) : 0);
				};
				const onEnded = () => {
					finishWithFade();
				};
				video.addEventListener("playing", onPlaying);
				video.addEventListener("timeupdate", onTimeUpdate);
				video.addEventListener("ended", onEnded);
				video.src = url;
				video.load();
				const attempt = video.play();
				if (attempt !== void 0 && typeof attempt.then === "function") attempt.then(() => void 0).catch((error) => {
					setNeedsTap(true);
				});
				const guard = window.setTimeout(() => {
					if (!closedRef.current) {
						store.setPhase("stalled", "overlay.stalled");
						report("stalled, giving up after " + String(STALL_TIMEOUT_MS) + "ms");
						close();
					}
				}, STALL_TIMEOUT_MS);
				return () => {
					video.removeEventListener("playing", onPlaying);
					video.removeEventListener("timeupdate", onTimeUpdate);
					video.removeEventListener("ended", onEnded);
					window.clearTimeout(guard);
					releaseVideo(video);
				};
			}, [
				url,
				nonce,
				clipId,
				reason,
				store,
				close,
				finishWithFade,
				settings.volume,
				settings.playbackRate,
				settings.autoSkipSeconds
			]);
			/** The countdown, which is a display concern only: `close` is what ends it. */
			(0, react.useEffect)(() => {
				if (remaining === null || url === null) return void 0;
				if (remaining <= 0) {
					close();
					return;
				}
				const timer = window.setTimeout(() => setRemaining(remaining - 1), 1e3);
				return () => window.clearTimeout(timer);
			}, [
				remaining,
				url,
				close
			]);
			/** Keyboard skip, disabled while the picker owns the keyboard. */
			(0, react.useEffect)(() => {
				if (url === null) return void 0;
				const onKey = (event) => {
					if (!skipKeysEnabled) return;
					if (!SKIP_KEYS.has(event.key)) return;
					const active = document.activeElement;
					const tag = active === null ? "" : active.tagName;
					if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
					event.preventDefault();
					close();
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [url, close]);
			if (url === null || phase === "idle") return null;
			const activate = () => {
				const video = videoRef.current;
				if (video === null) return;
				if (needsTap) {
					setNeedsTap(false);
					video.muted = false;
					const attempt = video.play();
					if (attempt !== void 0 && typeof attempt.catch === "function") attempt.catch(() => {});
				} else if (video.muted) video.muted = false;
				if (document.fullscreenElement === null && typeof video.requestFullscreen === "function") video.requestFullscreen().catch(() => {});
			};
			const clip = clipId === null ? null : store.clip(clipId);
			const label = t(`reason.${reason}`);
			const effect = effectClass(settings.overlayEffect);
			const statusKey = phase === "error" ? snapshot.playback.message ?? "overlay.error" : phase === "stalled" ? "overlay.stalled" : phase === "loading" ? "overlay.loading" : null;
			return (0, react.createElement)("div", {
				className: "dbap-root" + (fading ? " dbap-fading" : ""),
				onClick: activate
			}, (0, react.createElement)("video", {
				ref: videoRef,
				className: settings.fitMode === "cover" ? "dbap-video dbap-cover" : "dbap-video",
				muted: true,
				autoPlay: true,
				playsInline: true,
				preload: "auto",
				onEnded: finishWithFade,
				onClick: (event) => {
					event.stopPropagation();
					activate();
				},
				onError: () => {
					const video = videoRef.current;
					notify("video element error", {
						code: video?.error?.code ?? 0,
						message: video?.error?.message ?? "",
						clipId,
						src: video?.currentSrc || url,
						readyState: video?.readyState ?? -1
					});
					store.setPhase("error", "overlay.error");
					window.setTimeout(() => {
						if (!closedRef.current) close();
					}, ERROR_LINGER_MS);
				}
			}), effect === null ? null : (0, react.createElement)("div", { className: "dbap-fx " + effect }), (0, react.createElement)("div", { className: "dbap-what" }, `${label} · ${clip?.name ?? clipId ?? ""}`), settings.overlayTitle === "" && settings.overlaySubtitle === "" ? null : (0, react.createElement)("div", { className: "dbap-caption" }, settings.overlayTitle === "" ? null : (0, react.createElement)("div", { className: "dbap-caption-title" }, settings.overlayTitle), settings.overlaySubtitle === "" ? null : (0, react.createElement)("div", { className: "dbap-caption-sub" }, settings.overlaySubtitle)), settings.watermark === "" ? null : (0, react.createElement)("div", { className: "dbap-watermark" }, settings.watermark), statusKey === null ? null : (0, react.createElement)("div", { className: "dbap-status" }, t(statusKey)), settings.showProgress ? (0, react.createElement)("div", { className: "dbap-progress" }, (0, react.createElement)("i", { style: { width: `${String(Math.round(progress * 100))}%` } })) : null, (0, react.createElement)("button", {
				type: "button",
				className: "dbap-skip",
				onClick: (event) => {
					event.stopPropagation();
					close();
				}
			}, remaining !== null && remaining > 0 ? t("overlay.skipIn", { n: remaining }) : t("overlay.skip")), (0, react.createElement)("div", { className: "dbap-hint" }, needsTap ? t("overlay.tapToPlay") : t("overlay.tapForSound"), previewClipId !== null && previewClipId === clipId ? " · " + t("overlay.previewing") : ""));
		}
		//#endregion
		//#region src/client/ui-library.ts
		function formatBytes(n) {
			if (!Number.isFinite(n) || n <= 0) return "0 B";
			if (n < 1024) return n + " B";
			if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
			return (n / 1024 / 1024).toFixed(2) + " MB";
		}
		/** Where a clip comes from, as one word a user can act on. */
		const SOURCE_LABEL_KEY = {
			yours: "lib.source.yours",
			embedded: "lib.source.embedded",
			env: "lib.source.env",
			legacy: "lib.source.legacy"
		};
		/** Why this clip is on screen, in words. */
		const SOURCE_FALLBACK = "lib.source.yours";
		const ALL_DAYS = [
			0,
			1,
			2,
			3,
			4,
			5,
			6
		];
		/**
		* A text input that writes on blur or Enter, never on every keystroke.
		*
		* Without the local buffer, typing a title into an input bound straight to the
		* store would fire one write per character and fight the re-read that follows
		* each one, which is how a field ends up dropping the character you just typed.
		*/
		function TextField({ label, value, placeholder, hint, onCommit }) {
			const [text, setText] = (0, react.useState)(value);
			const focused = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!focused.current) setText(value);
			}, [value]);
			return (0, react.createElement)("label", { className: "dbap-field" }, (0, react.createElement)("span", { className: "dbap-field-label" }, label, hint === void 0 ? null : (0, react.createElement)("em", null, " " + hint)), (0, react.createElement)("input", {
				type: "text",
				className: "dbap-input",
				value: text,
				placeholder: placeholder ?? "",
				onFocus: () => {
					focused.current = true;
				},
				onChange: (event) => setText(event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Enter") event.target.blur();
				},
				onBlur: () => {
					focused.current = false;
					if (text !== value) onCommit(text);
				}
			}));
		}
		/** A number input with a range and a unit, committed on blur or Enter. */
		function NumberField({ label, value, min, max, step = 1, hint, onCommit }) {
			const [text, setText] = (0, react.useState)(String(value));
			const focused = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!focused.current) setText(String(value));
			}, [value]);
			const commit = () => {
				const parsed = Number(text);
				if (!Number.isFinite(parsed)) {
					setText(String(value));
					return;
				}
				const clamped = Math.min(max, Math.max(min, parsed));
				setText(String(clamped));
				if (clamped !== value) onCommit(clamped);
			};
			return (0, react.createElement)("label", { className: "dbap-field" }, (0, react.createElement)("span", { className: "dbap-field-label" }, label, hint === void 0 ? null : (0, react.createElement)("em", null, " " + hint)), (0, react.createElement)("input", {
				type: "number",
				className: "dbap-input dbap-num",
				value: text,
				min,
				max,
				step,
				onFocus: () => {
					focused.current = true;
				},
				onChange: (event) => setText(event.target.value),
				onKeyDown: (event) => {
					if (event.key === "Enter") event.target.blur();
				},
				onBlur: () => {
					focused.current = false;
					commit();
				}
			}));
		}
		/** A slider that writes on release, so dragging does not flood the host. */
		function SliderField({ label, value, min, max, step, onCommit }) {
			const [local, setLocal] = (0, react.useState)(value);
			const dragging = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!dragging.current) setLocal(value);
			}, [value]);
			return (0, react.createElement)("label", { className: "dbap-field" }, (0, react.createElement)("span", { className: "dbap-field-label" }, `${label} ${String(Math.round(local * 100) / 100)}`), (0, react.createElement)("input", {
				type: "range",
				className: "dbap-range",
				value: local,
				min,
				max,
				step,
				onChange: (event) => {
					dragging.current = true;
					setLocal(Number(event.target.value));
				},
				onPointerUp: () => {
					dragging.current = false;
					if (local !== value) onCommit(local);
				},
				onKeyUp: () => {
					dragging.current = false;
					if (local !== value) onCommit(local);
				}
			}));
		}
		/** A checkbox bound to one boolean setting. */
		function ToggleField({ label, value, title, onCommit }) {
			return (0, react.createElement)("label", {
				className: "dbap-toggle",
				title
			}, (0, react.createElement)("input", {
				type: "checkbox",
				checked: value,
				onChange: (event) => onCommit(event.target.checked)
			}), (0, react.createElement)("span", null, label));
		}
		/** The panel. */
		function VideoLibrary({ store, sessionId, onClose }) {
			ensureStyle();
			const snapshot = useClientStore(store);
			const settings = snapshot.settings;
			const t = (0, react.useMemo)(() => translatorFor(resolveLocale(settings.locale)), [settings.locale]);
			const clips = snapshot.catalog?.clips ?? [];
			const selectedClipId = settings.selectedClipId;
			const playingClipId = snapshot.playback.clipId;
			const previewClipId = snapshot.playback.previewClipId;
			const busy = snapshot.busy;
			const [tab, setTab] = (0, react.useState)("library");
			const [renamingId, setRenamingId] = (0, react.useState)(null);
			const [renameText, setRenameText] = (0, react.useState)("");
			const [draftDays, setDraftDays] = (0, react.useState)(ALL_DAYS);
			const [draftStart, setDraftStart] = (0, react.useState)("09:00");
			const [draftEnd, setDraftEnd] = (0, react.useState)("18:00");
			const [draftLabel, setDraftLabel] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				setSkipKeysEnabled(false);
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					setSkipKeysEnabled(true);
					window.removeEventListener("keydown", onKey);
				};
			}, [onClose]);
			const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
			const scheduledIds = new Set(settings.timeRules.filter((rule) => rule.enabled).map((rule) => rule.clipId));
			const sessionListed = sessionId !== null && settings.sessionList.ids.includes(sessionId);
			/** Delete is the one action here that destroys something, so it confirms. */
			const confirmRemove = (clip) => {
				const target = clip.file ?? clip.name;
				if (!window.confirm(t("lib.delete.confirm", { file: target }))) return;
				store.removeClip(clip.id);
			};
			const clipRow = (clip) => {
				const isSelected = clip.id === selectedClipId;
				const sourceKey = SOURCE_LABEL_KEY[clip.source] ?? SOURCE_FALLBACK;
				return (0, react.createElement)("div", {
					key: clip.id,
					className: "dbap-item" + (isSelected ? " dbap-cur" : ""),
					title: clip.file ?? clip.id
				}, (0, react.createElement)("span", { className: "dbap-mark" }, isSelected ? "✓" : ""), renamingId === clip.id ? (0, react.createElement)("input", {
					type: "text",
					className: "dbap-input dbap-inline-rename",
					value: renameText,
					autoFocus: true,
					placeholder: clip.originalName ?? clip.name,
					onChange: (event) => setRenameText(event.target.value),
					onKeyDown: (event) => {
						if (event.key === "Enter") {
							store.renameClip(clip.id, renameText);
							setRenamingId(null);
						} else if (event.key === "Escape") setRenamingId(null);
					},
					onBlur: () => {
						setRenamingId(null);
					}
				}) : (0, react.createElement)("span", { className: "dbap-nm" }, clip.name), clip.renamed === true ? (0, react.createElement)("span", { className: "dbap-badge" }, "✎") : null, clip.id === playingClipId ? (0, react.createElement)("span", { className: "dbap-badge dbap-b-sel" }, previewClipId === clip.id ? t("lib.previewing") : t("lib.playing")) : null, clip.legacy ? (0, react.createElement)("span", { className: "dbap-badge" }, t("lib.badge.legacy")) : null, (clip.copies ?? 1) > 1 ? (0, react.createElement)("span", {
					className: "dbap-badge",
					title: t("lib.badge.copies.title", { n: clip.copies ?? 1 })
				}, t("lib.badge.copies", { n: clip.copies ?? 1 })) : null, (clip.ext === ".mp4" || clip.ext === ".m4v") && clip.faststart === false ? (0, react.createElement)("span", {
					className: "dbap-badge dbap-b-warn",
					title: t("lib.badge.faststart.title")
				}, t("lib.badge.faststart")) : null, scheduledIds.has(clip.id) ? (0, react.createElement)("span", {
					className: "dbap-badge dbap-b-prev",
					title: t("lib.badge.scheduled.title")
				}, t("lib.badge.scheduled")) : null, (0, react.createElement)("span", { className: "dbap-badge" }, t(sourceKey)), clip.removable !== true && clip.kind === "file" ? (0, react.createElement)("span", {
					className: "dbap-badge",
					title: t("lib.badge.readonly.title")
				}, t("lib.badge.readonly")) : null, (0, react.createElement)("span", { className: "dbap-meta" }, formatBytes(clip.bytes)), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-row-btn dbap-star" + (clip.favorite === true ? " dbap-star-on" : ""),
					title: t("lib.favorite.title"),
					onClick: () => void store.toggleFavorite(clip.id)
				}, clip.favorite === true ? t("lib.favorite.on") : t("lib.favorite.off")), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-row-btn",
					title: t("lib.preview.title"),
					onClick: () => {
						store.preview(clip.id);
					}
				}, t("lib.preview")), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-row-btn" + (isSelected ? "" : " dbap-go"),
					disabled: busy || isSelected,
					title: t("lib.select.title"),
					onClick: () => {
						if (!busy) store.selectClip(clip.id);
					}
				}, isSelected ? t("lib.selected") : t("lib.select")), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-row-btn",
					title: t("lib.rename.title"),
					onClick: () => {
						setRenamingId(clip.id);
						setRenameText(clip.renamed === true ? clip.name : "");
					}
				}, t("lib.rename")), clip.removable === true ? (0, react.createElement)("button", {
					type: "button",
					className: "dbap-row-btn dbap-danger",
					title: t("lib.delete.title"),
					onClick: () => confirmRemove(clip)
				}, t("lib.delete")) : null);
			};
			const libraryTab = [
				(0, react.createElement)("p", { key: "intro" }, t("lib.intro")),
				(0, react.createElement)("div", {
					key: "sort",
					className: "dbap-choice dbap-sort"
				}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("lib.sort")), ...SORT_MODES.map((mode) => (0, react.createElement)("button", {
					key: mode,
					type: "button",
					className: "dbap-btn" + (settings.sortMode === mode ? " dbap-btn-on" : ""),
					onClick: () => void store.save({ sortMode: mode }, "status.saved")
				}, t(`lib.sort.${mode}`)))),
				...clips.length === 0 ? [(0, react.createElement)("div", {
					key: "empty",
					className: "dbap-item"
				}, (0, react.createElement)("span", { className: "dbap-nm" }, snapshot.loading ? t("lib.loading") : t("lib.empty")))] : clips.map(clipRow),
				(0, react.createElement)("div", {
					key: "dir",
					className: "dbap-dir"
				}, t("lib.dir.hint"), (0, react.createElement)("br", null), (0, react.createElement)("code", null, snapshot.catalog?.userDir ?? "…"))
			];
			const playbackTab = [
				(0, react.createElement)("div", {
					key: "fit",
					className: "dbap-choice"
				}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("play.fit")), ...["cover", "contain"].map((mode) => (0, react.createElement)("button", {
					key: mode,
					type: "button",
					className: "dbap-btn" + (settings.fitMode === mode ? " dbap-btn-on" : ""),
					title: mode === "cover" ? t("play.fit.cover.title") : t("play.fit.contain.title"),
					onClick: () => void store.setFitMode(mode)
				}, mode === "cover" ? t("play.fit.cover") : t("play.fit.contain")))),
				(0, react.createElement)("div", { key: "random" }, (0, react.createElement)("button", {
					type: "button",
					className: "dbap-btn" + (settings.randomPlayback ? " dbap-btn-on" : ""),
					title: t("play.random.title"),
					onClick: () => void store.setRandomPlayback(!settings.randomPlayback)
				}, settings.randomPlayback ? t("play.random.on") : t("play.random.off"))),
				(0, react.createElement)(SliderField, {
					key: "volume",
					label: t("play.volume"),
					value: settings.volume,
					min: 0,
					max: 1,
					step: .05,
					onCommit: (next) => void store.save({ volume: next }, "status.saved")
				}),
				(0, react.createElement)(ToggleField, {
					key: "muted",
					label: t("play.muted"),
					title: t("play.muted.title"),
					value: settings.muted,
					onCommit: (next) => void store.save({ muted: next }, "status.saved")
				}),
				(0, react.createElement)(NumberField, {
					key: "rate",
					label: t("play.rate"),
					value: settings.playbackRate,
					min: RATE_RANGE[0],
					max: RATE_RANGE[1],
					step: .25,
					onCommit: (next) => void store.save({ playbackRate: next }, "status.saved")
				}),
				(0, react.createElement)(ToggleField, {
					key: "progress",
					label: t("play.progress"),
					value: settings.showProgress,
					onCommit: (next) => void store.save({ showProgress: next }, "status.saved")
				}),
				(0, react.createElement)(NumberField, {
					key: "autoskip",
					label: t("play.autoSkip"),
					hint: t("play.autoSkip.title"),
					value: settings.autoSkipSeconds,
					min: 0,
					max: 60,
					onCommit: (next) => void store.save({ autoSkipSeconds: next }, "status.saved")
				}),
				(0, react.createElement)(NumberField, {
					key: "fade",
					label: t("play.fade"),
					hint: t("play.fade.title"),
					value: settings.fadeOutMs,
					min: FADE_RANGE[0],
					max: FADE_RANGE[1],
					step: 50,
					onCommit: (next) => void store.save({ fadeOutMs: next }, "status.saved")
				})
			];
			const triggerTab = [
				(0, react.createElement)("div", {
					key: "mode",
					className: "dbap-stack"
				}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("trigger.mode")), ...TRIGGER_MODES.map((mode) => (0, react.createElement)("button", {
					key: mode,
					type: "button",
					className: "dbap-btn dbap-wide" + (settings.triggerMode === mode ? " dbap-btn-on" : ""),
					title: t(`trigger.mode.${mode}.title`),
					onClick: () => void store.save({ triggerMode: mode }, "status.saved")
				}, t(`trigger.mode.${mode}`)))),
				(0, react.createElement)(NumberField, {
					key: "cooldown",
					label: t("trigger.cooldown"),
					hint: t("trigger.cooldown.title"),
					value: settings.cooldownMinutes,
					min: COOLDOWN_RANGE[0],
					max: COOLDOWN_RANGE[1],
					step: 5,
					onCommit: (next) => void store.save({ cooldownMinutes: next }, "status.saved")
				}),
				(0, react.createElement)("div", {
					key: "list",
					className: "dbap-stack"
				}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("trigger.list")), (0, react.createElement)("div", { className: "dbap-choice" }, ...SESSION_LIST_MODES.map((mode) => (0, react.createElement)("button", {
					key: mode,
					type: "button",
					className: "dbap-btn" + (settings.sessionList.mode === mode ? " dbap-btn-on" : ""),
					onClick: () => void store.save({ sessionListOp: {
						op: "mode",
						mode
					} }, "status.listMode", { mode: t(`trigger.list.${mode}`) })
				}, t(`trigger.list.${mode}`)))), (0, react.createElement)("div", { className: "dbap-choice" }, (0, react.createElement)("span", { className: "dbap-meta" }, t("trigger.list.count", { n: settings.sessionList.ids.length })), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-btn",
					disabled: sessionId === null || busy,
					title: sessionId === null ? t("trigger.list.none") : sessionListed ? t("trigger.list.inList") : t("trigger.list.notInList"),
					onClick: () => {
						if (sessionId === null || busy) return;
						store.save({ sessionListOp: {
							op: sessionListed ? "remove" : "add",
							id: sessionId
						} }, sessionListed ? "status.sessionRemoved" : "status.sessionAdded");
					}
				}, sessionListed ? t("trigger.list.remove") : t("trigger.list.add"))))
			];
			const overlayTab = [
				(0, react.createElement)(TextField, {
					key: "title",
					label: t("overlay.field.title"),
					hint: t("overlay.field.empty"),
					placeholder: t("overlay.title.placeholder"),
					value: settings.overlayTitle,
					onCommit: (next) => void store.save({ overlayTitle: next }, "status.saved")
				}),
				(0, react.createElement)(TextField, {
					key: "subtitle",
					label: t("overlay.field.subtitle"),
					hint: t("overlay.field.empty"),
					placeholder: t("overlay.subtitle.placeholder"),
					value: settings.overlaySubtitle,
					onCommit: (next) => void store.save({ overlaySubtitle: next }, "status.saved")
				}),
				(0, react.createElement)(TextField, {
					key: "watermark",
					label: t("overlay.field.watermark"),
					hint: t("overlay.field.empty"),
					placeholder: t("overlay.watermark.placeholder"),
					value: settings.watermark,
					onCommit: (next) => void store.save({ watermark: next }, "status.saved")
				}),
				(0, react.createElement)("div", {
					key: "effect",
					className: "dbap-choice dbap-wrap"
				}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("overlay.field.effect")), ...OVERLAY_EFFECTS.map((effect) => (0, react.createElement)("button", {
					key: effect,
					type: "button",
					className: "dbap-btn" + (settings.overlayEffect === effect ? " dbap-btn-on" : ""),
					onClick: () => void store.save({ overlayEffect: effect }, "status.saved")
				}, t(`overlay.effect.${effect}`))))
			];
			const ruleRow = (rule) => {
				const clip = clips.find((entry) => entry.id === rule.clipId);
				return (0, react.createElement)("div", {
					key: rule.id,
					className: "dbap-rule" + (rule.enabled ? "" : " dbap-rule-off")
				}, (0, react.createElement)("div", { className: "dbap-rule-top" }, (0, react.createElement)("span", { className: "dbap-nm" }, rule.label === "" ? t("sched.ruleOf", { n: settings.timeRules.indexOf(rule) + 1 }) : rule.label), (0, react.createElement)("span", { className: "dbap-meta" }, clip?.name ?? rule.clipId)), (0, react.createElement)("div", { className: "dbap-rule-bottom" }, (0, react.createElement)("span", { className: "dbap-meta" }, `${t("sched.days")} ${rule.days.length === 7 ? t("sched.allDays") : rule.days.map((day) => t(`sched.day.${day}`)).join(" ")}`), (0, react.createElement)("span", { className: "dbap-meta" }, `${rule.start} → ${rule.end}`), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-btn" + (rule.enabled ? " dbap-btn-on" : ""),
					onClick: () => void store.save({ setTimeRuleEnabled: {
						id: rule.id,
						enabled: !rule.enabled
					} }, "status.saved")
				}, t("sched.enable")), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-btn dbap-danger",
					onClick: () => void store.save({ removeTimeRule: rule.id }, "status.ruleRemoved")
				}, t("sched.remove"))));
			};
			const scheduleTab = [
				(0, react.createElement)("p", { key: "hint" }, t("sched.hint")),
				(0, react.createElement)("p", {
					key: "wrap",
					className: "dbap-dim"
				}, t("sched.wrap")),
				...settings.timeRules.length === 0 ? [(0, react.createElement)("div", {
					key: "empty",
					className: "dbap-item"
				}, (0, react.createElement)("span", { className: "dbap-nm" }, t("sched.empty")))] : settings.timeRules.map(ruleRow),
				(0, react.createElement)("div", {
					key: "add",
					className: "dbap-rule dbap-rule-new"
				}, (0, react.createElement)("div", { className: "dbap-rule-top" }, (0, react.createElement)("span", { className: "dbap-nm" }, t("sched.add")), (0, react.createElement)("span", { className: "dbap-meta" }, selectedClip === null ? t("sched.needSelection") : selectedClip.name)), (0, react.createElement)("div", { className: "dbap-rule-bottom" }, ...ALL_DAYS.map((day) => (0, react.createElement)("button", {
					key: day,
					type: "button",
					className: "dbap-btn dbap-day" + (draftDays.includes(day) ? " dbap-btn-on" : ""),
					onClick: () => setDraftDays((current) => current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day].sort((a, b) => a - b))
				}, t(`sched.day.${day}`))), (0, react.createElement)("span", { className: "dbap-meta" }, t("sched.from")), (0, react.createElement)("input", {
					type: "time",
					className: "dbap-input dbap-time",
					value: draftStart,
					onChange: (event) => setDraftStart(event.target.value)
				}), (0, react.createElement)("span", { className: "dbap-meta" }, t("sched.to")), (0, react.createElement)("input", {
					type: "time",
					className: "dbap-input dbap-time",
					value: draftEnd,
					onChange: (event) => setDraftEnd(event.target.value)
				}), (0, react.createElement)("input", {
					type: "text",
					className: "dbap-input dbap-rule-label",
					value: draftLabel,
					placeholder: t("sched.label.placeholder"),
					onChange: (event) => setDraftLabel(event.target.value)
				}), (0, react.createElement)("button", {
					type: "button",
					className: "dbap-btn dbap-go",
					disabled: selectedClip === null || draftDays.length === 0 || busy,
					onClick: () => {
						if (selectedClip === null) return;
						store.save({ addTimeRule: {
							clipId: selectedClip.id,
							days: draftDays,
							start: draftStart,
							end: draftEnd,
							label: draftLabel
						} }, "status.ruleAdded").then(() => setDraftLabel(""));
					}
				}, t("sched.add"))))
			];
			const interfaceTab = [(0, react.createElement)("div", {
				key: "locale",
				className: "dbap-choice dbap-wrap"
			}, (0, react.createElement)("span", { className: "dbap-choice-label" }, t("ui.locale")), ...[
				"auto",
				"zh",
				"en"
			].map((locale) => (0, react.createElement)("button", {
				key: locale,
				type: "button",
				className: "dbap-btn" + (settings.locale === locale ? " dbap-btn-on" : ""),
				onClick: () => void store.save({ locale }, "status.saved")
			}, t(`ui.locale.${locale}`)))), (0, react.createElement)("dl", {
				key: "about",
				className: "dbap-about"
			}, (0, react.createElement)("dt", null, t("ui.info")), (0, react.createElement)("dd", null, "dsh-boot-animation-pro · schema v" + String(settings.version)), (0, react.createElement)("dd", null, (0, react.createElement)("code", null, snapshot.catalog?.userDir ?? "…")))];
			const TABS = [
				["library", libraryTab],
				["playback", playbackTab],
				["trigger", triggerTab],
				["overlay", overlayTab],
				["schedule", scheduleTab],
				["interface", interfaceTab]
			];
			const active = TABS.find(([name]) => name === tab) ?? TABS[0];
			return (0, react.createElement)("div", {
				className: "dbap-veil",
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				}
			}, (0, react.createElement)("div", {
				className: "dbap-lib",
				onClick: (event) => event.stopPropagation()
			}, (0, react.createElement)("h3", null, t("lib.title")), (0, react.createElement)("div", { className: "dbap-tabs" }, ...TABS.map(([name]) => (0, react.createElement)("button", {
				key: name,
				type: "button",
				className: "dbap-tab" + (name === tab ? " dbap-tab-on" : ""),
				onClick: () => setTab(name)
			}, t(`lib.tab.${name}`)))), (0, react.createElement)("div", { className: "dbap-body" }, ...active[1]), (0, react.createElement)("div", { className: "dbap-bar" }, (0, react.createElement)("button", {
				type: "button",
				className: "dbap-btn",
				title: t("lib.playOnce.title"),
				onClick: () => void store.playMode(settings.randomPlayback ? "random" : "selected", "active")
			}, t("lib.playOnce")), (0, react.createElement)("button", {
				type: "button",
				className: "dbap-btn",
				onClick: () => void store.loadCatalog()
			}, t("lib.refresh")), (0, react.createElement)("button", {
				type: "button",
				className: "dbap-btn",
				onClick: onClose
			}, t("lib.close"))), (0, react.createElement)("div", { className: "dbap-msg " + snapshot.status.kind }, snapshot.status.key === null ? "" : t(snapshot.status.key, snapshot.status.params))));
		}
		//#endregion
		//#region src/client/session.ts
		/**
		* Session binding and the trigger rules.
		*
		* Two pieces of hard-won knowledge live here and must not be lost:
		*
		* 1. `hooks.session` is a `SessionFace` — `ISession & ObservableSnapshot<SessionSnapshot>`
		*    (see `@deepseek-ai/dsh-api-session-controller`) — so "this conversation has
		*    no turns yet" is `getSnapshot().blank`. Before DSH 0.2.0 the flag was a
		*    `blankBit` field directly on the binding. Reading the field that is no
		*    longer there does not throw, it answers `undefined`, so the failure was
		*    silence: auto-play simply stopped happening. Both shapes are read, and the
		*    face is SUBSCRIBED to rather than sampled once, because the flag arrives on
		*    a nested snapshot that can settle after the binding changes.
		*
		* 2. Both the pin and the "already played" record are per session, keyed by
		*    session id, and both live in localStorage. They are client concerns: the
		*    host never learns a session id from this plugin.
		*
		* Everything from "when should the intro play" upwards is `decideTrigger`, a PURE
		* function of the settings, the clock and three small pieces of browser state.
		* That is deliberate: the rule set grew from one behaviour to five plus a
		* cooldown plus a session allow/deny list, and a rule engine that can only be
		* tested by driving React is a rule engine that will be wrong.
		*/
		/**
		* True when the current conversation still has no turns, from whichever shape
		* the running host exposes.
		*
		* Exported so `scripts/verify-blank.mjs` can exercise THIS shipped function
		* rather than a copy of it. The bug it guards against is a silent one — a field
		* that moved answers `undefined` instead of throwing — so a test that only
		* checked "the bundle built" would not have caught it.
		*/
		function isBlankSession(session) {
			if (session === null || session === void 0) return false;
			if (typeof session.getSnapshot === "function") try {
				const snapshot = session.getSnapshot();
				if (snapshot !== null && typeof snapshot === "object" && "blank" in snapshot) return snapshot.blank === true;
			} catch {}
			return session.blankBit === true;
		}
		/**
		* Resolve the current Session identity across the host shapes this plugin supports.
		*
		* Reading only `props.sessionId` does not throw on a host that moved the
		* identity — it answers `undefined`, so the per-session "already played" record
		* and the pin silently stopped matching. The modern Session face carries
		* `sessionId` in its snapshot; ui-session's current adapter also publishes the
		* same identity as `binding.key`; the old prop stays last as a compatibility
		* fallback.
		*
		* Exported so `scripts/verify-session-id.mjs` exercises THIS shipped function.
		*/
		function resolveSessionId(binding) {
			const session = binding?.hooks?.session;
			let snapshot = null;
			try {
				if (session !== void 0 && typeof session.getSnapshot === "function") snapshot = session.getSnapshot();
			} catch {}
			const candidate = (snapshot !== null && typeof snapshot === "object" && "sessionId" in snapshot ? snapshot.sessionId : void 0) ?? (typeof binding?.key === "string" ? binding.key : void 0) ?? (typeof binding?.props?.sessionId === "string" ? binding.props.sessionId : void 0);
			return typeof candidate === "string" && candidate !== "" ? candidate : null;
		}
		const noopSubscribe = () => () => {};
		/** Subscribe to the current-conversation store, tolerating its absence. */
		function useCurrentSession(store) {
			const binding = (0, react.useSyncExternalStore)(store === null ? noopSubscribe : store.subscribe, store === null ? () => null : store.getSnapshot);
			const session = binding?.hooks?.session;
			const subscribeBlank = (0, react.useCallback)((onChange) => {
				if (session === void 0 || typeof session.subscribe !== "function") return () => {};
				const stop = session.subscribe(onChange);
				return typeof stop === "function" ? stop : () => {};
			}, [session]);
			const isNewConversation = (0, react.useSyncExternalStore)(subscribeBlank, () => isBlankSession(session));
			return {
				sessionId: resolveSessionId(binding),
				isNewConversation
			};
		}
		const SEEN_KEY = "dsh-boot-animation-pro:played";
		const PIN_KEY = "dsh-boot-animation-pro:pinned";
		const PLAYED_AT_KEY = "dsh-boot-animation-pro:played-at";
		const MAX_SEEN = 80;
		/** localStorage, or null where it is unavailable (private mode, a bare test). */
		function storage() {
			try {
				return typeof window === "undefined" ? null : window.localStorage;
			} catch {
				return null;
			}
		}
		function readSeen() {
			try {
				const parsed = JSON.parse(storage()?.getItem(SEEN_KEY) ?? "[]");
				return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
			} catch {
				return [];
			}
		}
		function hasPlayed(sessionId) {
			return readSeen().includes(sessionId);
		}
		function markPlayed(sessionId) {
			try {
				const seen = readSeen();
				if (!seen.includes(sessionId)) seen.push(sessionId);
				while (seen.length > MAX_SEEN) seen.shift();
				storage()?.setItem(SEEN_KEY, JSON.stringify(seen));
			} catch {}
		}
		function readPinned() {
			try {
				const value = storage()?.getItem(PIN_KEY) ?? null;
				return value === null || value === "" ? null : value;
			} catch {
				return null;
			}
		}
		function writePinned(sessionId) {
			try {
				if (sessionId === null) storage()?.removeItem(PIN_KEY);
				else storage()?.setItem(PIN_KEY, sessionId);
			} catch {}
		}
		/**
		* When an intro last played, as epoch milliseconds, or null.
		*
		* The cooldown needs a time, and it must survive a reload — otherwise "do not
		* disturb me twice in ten minutes" would reset every time the page is refreshed,
		* which is exactly when it is most annoying.
		*/
		function readLastPlayedAt() {
			try {
				const raw = storage()?.getItem(PLAYED_AT_KEY) ?? null;
				if (raw === null) return null;
				const parsed = Number(raw);
				return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
			} catch {
				return null;
			}
		}
		function writeLastPlayedAt(epochMs) {
			try {
				storage()?.setItem(PLAYED_AT_KEY, String(epochMs));
			} catch {}
		}
		/**
		* Whether "once per DSH start" has already been spent.
		*
		* A module-level flag, not storage: one page load IS one start, so a reload must
		* reset it and a second tab must not consume the other tab's turn.
		*/
		let playedThisLaunch = false;
		function hasPlayedThisLaunch() {
			return playedThisLaunch;
		}
		function markPlayedThisLaunch() {
			playedThisLaunch = true;
		}
		/**
		* The complete answer to "should the intro play right now".
		*
		* Order matters and is the contract:
		*
		*   1. mode `off`                → nothing plays, whatever else is true
		*   2. no session                → nothing to attach a rule to, EXCEPT startup
		*   3. session allow/deny list   → a veto, whatever the mode says
		*   4. cooldown                  → a veto, whatever the mode says
		*   5. the mode itself
		*
		* The list and the cooldown are vetoes rather than modes on purpose: they answer
		* "not this time", which composes with every mode, instead of being a sixth thing
		* the mode has to consider.
		*
		* `startup-only` is deliberately decided BEFORE the session gate. It is the one
		* rule about the APP rather than about a conversation, and a conversation is not
		* always open — DSH can be sitting on the settings page or a plugin panel when it
		* starts. Requiring a session there made "play once every time I open DSH" fail
		* silently in exactly that case, which is the kind of failure this file exists to
		* prevent. The session list cannot apply without a session, so it is skipped.
		*
		* @param input
		* @returns the decision; `reason` is only meaningful when `play` is true
		*/
		function decideTrigger(input) {
			const no = (why) => ({
				play: false,
				reason: "",
				why
			});
			if (input.triggerMode === "off") return no("triggerMode is off");
			const startupOnly = input.triggerMode === "startup-only";
			if (input.sessionId === null && !startupOnly) return no("no current session");
			if (input.sessionId !== null) {
				const listed = input.sessionList.ids.includes(input.sessionId);
				if (input.sessionList.mode === "allow" && !listed) return no("session is not on the allow list");
				if (input.sessionList.mode === "deny" && listed) return no("session is on the deny list");
			}
			if (input.cooldownMinutes > 0 && input.lastPlayedAt !== null) {
				const elapsed = input.now - input.lastPlayedAt;
				if (elapsed >= 0 && elapsed < input.cooldownMinutes * 6e4) return no(`cooldown: ${String(Math.round(elapsed / 1e3))}s of ${String(input.cooldownMinutes * 60)}s elapsed`);
			}
			switch (input.triggerMode) {
				case "startup-only": return input.playedThisLaunch ? no("already played in this launch") : {
					play: true,
					reason: "startup-only",
					why: "first play of this launch"
				};
				case "always": return input.entered ? {
					play: true,
					reason: "always",
					why: "a conversation was entered"
				} : no("same conversation, no entry");
				case "new-only": return input.isNewConversation && !input.hasPlayed ? {
					play: true,
					reason: "new-conversation",
					why: "a new conversation"
				} : no("not an unseen new conversation");
				case "new-and-pinned":
					if (input.pinned) return input.entered ? {
						play: true,
						reason: "pinned",
						why: "the pinned conversation was entered"
					} : no("pinned, but not re-entered");
					return input.isNewConversation && !input.hasPlayed ? {
						play: true,
						reason: "new-conversation",
						why: "a new conversation"
					} : no("not pinned, and not an unseen new conversation");
				default: return no(`unhandled triggerMode: ${String(input.triggerMode)}`);
			}
		}
		//#endregion
		//#region src/client/ui-pin.ts
		function PinAction({ store, sessionStore, onOpen }) {
			ensureStyle();
			const snapshot = useClientStore(store);
			const t = (0, react.useMemo)(() => translatorFor(resolveLocale(snapshot.settings.locale)), [snapshot.settings.locale]);
			const { sessionId } = useCurrentSession(sessionStore);
			const [pinned, setPinned] = (0, react.useState)(() => readPinned());
			const isPinned = sessionId !== null && pinned === sessionId;
			const toggle = () => {
				const next = isPinned ? null : sessionId;
				writePinned(next);
				setPinned(next);
				store.setStatus(isPinned ? "pin.unset" : "pin.set", "dbap-ok");
			};
			const title = sessionId === null ? t("pin.title.disabled") : isPinned ? t("pin.title.on") : t("pin.title.off");
			return (0, react.createElement)("span", {
				className: "dbap-pin-wrap",
				style: {
					display: "inline-flex",
					alignItems: "center"
				}
			}, (0, react.createElement)("button", {
				type: "button",
				className: isPinned ? "dbap-pin dbap-pin-on" : "dbap-pin",
				title,
				"aria-label": title,
				disabled: sessionId === null,
				onClick: toggle
			}, isPinned ? "🎬" : "🎞"), (0, react.createElement)("button", {
				type: "button",
				className: "dbap-pin dbap-lib-open",
				title: t("pin.open"),
				"aria-label": t("pin.open"),
				onClick: onOpen
			}, "🎛"));
		}
		//#endregion
		//#region src/client/ui-root.ts
		/** Openers registered by mounted AppRoots. */
		const libraryOpeners = /* @__PURE__ */ new Set();
		/** Ask whichever AppRoot is mounted to show the picker. */
		function openLibrary() {
			for (const open of libraryOpeners) try {
				open();
			} catch {}
		}
		function AppRoot({ store, sessionStore }) {
			const snapshot = useClientStore(store);
			const { sessionId, isNewConversation } = useCurrentSession(sessionStore);
			const [libraryOpen, setLibraryOpen] = (0, react.useState)(false);
			const lastSessionRef = (0, react.useRef)(null);
			const catalogLoaded = snapshot.catalog !== null;
			(0, react.useEffect)(() => {
				store.loadCatalog();
			}, [store]);
			(0, react.useEffect)(() => {
				const handler = () => setLibraryOpen(true);
				libraryOpeners.add(handler);
				return () => {
					libraryOpeners.delete(handler);
				};
			}, []);
			(0, react.useEffect)(() => {
				if (!catalogLoaded) return;
				/**
				* A conversation is not always open — DSH can start on the settings page or a
				* plugin panel. Only the startup rule can be decided without one, and
				* `decideTrigger` owns that rule rather than this effect guessing at it.
				*/
				const entered = sessionId !== null && lastSessionRef.current !== sessionId;
				if (sessionId !== null) lastSessionRef.current = sessionId;
				const settings = store.getSnapshot().settings;
				const decision = decideTrigger({
					triggerMode: settings.triggerMode,
					pinned: sessionId !== null && readPinned() === sessionId,
					isNewConversation,
					entered,
					sessionId,
					hasPlayed: sessionId !== null && hasPlayed(sessionId),
					sessionList: settings.sessionList,
					cooldownMinutes: settings.cooldownMinutes,
					lastPlayedAt: readLastPlayedAt(),
					now: Date.now(),
					playedThisLaunch: hasPlayedThisLaunch()
				});
				({ ...decision });
				if (!decision.play) return;
				if (decision.reason === "new-conversation" && sessionId !== null) markPlayed(sessionId);
				if (decision.reason === "startup-only") markPlayedThisLaunch();
				writeLastPlayedAt(Date.now());
				store.playMode("active", decision.reason);
			}, [
				catalogLoaded,
				sessionId,
				isNewConversation,
				store
			]);
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)(BootOverlay, { store }), libraryOpen ? (0, react.createElement)(VideoLibrary, {
				store,
				sessionId,
				onClose: () => setLibraryOpen(false)
			}) : null);
		}
		//#endregion
		//#region src/client/index.ts
		/** The ui-session store, when the host provides one that behaves. */
		function storeOf(ready) {
			const candidate = ready.uiSession?.adapter?.current;
			return candidate !== void 0 && typeof candidate.getSnapshot === "function" && typeof candidate.subscribe === "function" ? candidate : null;
		}
		function apply(ctx) {
			const wire = (ready) => {
				const sessionStore = storeOf(ready);
				const store = new ClientStore();
				ready.uiSession;
				const register = () => {
					ready.slots.inject("shell.overlay", () => ready.slots.register({
						name: "shell.overlay",
						id: "dsh-boot-animation-pro",
						order: 900
					}, () => (0, react.createElement)(AppRoot, {
						store,
						sessionStore
					})));
					ready.slots.inject("sidebar.footer.action", () => ready.slots.register({
						name: "sidebar.footer.action",
						id: "dsh-boot-animation-pro-pin",
						order: 40,
						label: () => translatorFor(resolveLocale(store.getSnapshot().settings.locale))("pin.label")
					}, () => (0, react.createElement)(PinAction, {
						store,
						sessionStore,
						onOpen: () => openLibrary()
					})));
				};
				if (typeof ready.effect === "function") ready.effect(register, "dsh-boot-animation-pro: mounts");
				else register();
			};
			if (typeof ctx.inject === "function") {
				ctx.inject(["slots", "uiSession"], wire);
				return;
			}
			if (ctx.slots !== void 0 && ctx.uiSession !== void 0) wire(ctx);
			else notify("idle: host offers no dynamic injection and no uiSession");
		}
		//#endregion
		exports.CATALOGS = CATALOGS;
		exports.CSS = CSS;
		exports.ClientStore = ClientStore;
		exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
		exports.FIT_MODES = FIT_MODES;
		exports.LOCALES = LOCALES;
		exports.OVERLAY_EFFECTS = OVERLAY_EFFECTS;
		exports.SESSION_LIST_MODES = SESSION_LIST_MODES;
		exports.SORT_MODES = SORT_MODES;
		exports.STYLE_ID = STYLE_ID;
		exports.TRIGGER_MODES = TRIGGER_MODES;
		exports.apply = apply;
		exports.decideTrigger = decideTrigger;
		exports.effectClass = effectClass;
		exports.formatMessage = formatMessage;
		exports.isBlankSession = isBlankSession;
		exports.mediaUrlFor = mediaUrlFor;
		exports.normaliseSettings = normaliseSettings;
		exports.releaseVideo = releaseVideo;
		exports.resolveLocale = resolveLocale;
		exports.resolveSessionId = resolveSessionId;
		exports.translatorFor = translatorFor;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map