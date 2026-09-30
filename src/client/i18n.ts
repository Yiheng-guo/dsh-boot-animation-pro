/**
 * i18n.ts — every word the user reads, in two languages.
 *
 * The rule this module exists to enforce: no component contains a sentence. A
 * component asks for a key, and the key resolves through the active dictionary.
 * That is what makes the language switch a one-line change instead of a hunt
 * through five files, and it is why `verify-i18n.mjs` can assert that both
 * dictionaries define exactly the same keys.
 *
 * `MessageKey` is derived from the Chinese dictionary, so adding a key without an
 * English translation is a TYPE error rather than a runtime fallback.
 *
 * Locale resolution never touches `navigator` at import time: the client bundle
 * is evaluated by the boot check in a bare Node context, and a top-level read of
 * a browser global there would take the whole module down.
 */
export type Locale = 'auto' | 'zh' | 'en'
/** The languages a message can actually be rendered in. */
export type ResolvedLocale = 'zh' | 'en'

const ZH = {
  // ------------------------------------------------------------------ overlay
  'overlay.loading': '正在加载视频…',
  'overlay.stalled': '视频加载超时',
  'overlay.error': '视频加载失败 —— 控制台有 [dsh-boot-animation-pro] 日志',
  'overlay.skip': '跳过',
  'overlay.skipIn': '{n} 秒后跳过',
  'overlay.tapToPlay': '点击播放',
  'overlay.tapForSound': '点击开启声音 · 全屏',
  'overlay.previewing': '预览中',

  // ------------------------------------------------------------------- reasons
  'reason.preview': '预览',
  'reason.new-conversation': '新对话',
  'reason.pinned': '钉住的会话',
  'reason.random': '随机播放',
  'reason.selected': '已选片头',
  'reason.active': '当前片头',
  'reason.explicit': '指定片段',
  'reason.fallback': '回退',
  'reason.schedule': '时段规则',
  'reason.always': '每次打开',
  'reason.startup-only': '本次启动',
  'reason.active-random': '随机播放',

  // ---------------------------------------------------------------------- pin
  'pin.title.on': '这个会话已设为片头会话：每次打开都会播放片头动画（点击取消）',
  'pin.title.off': '把这个会话设为片头会话：以后每次打开它都会播放片头动画',
  'pin.title.disabled': '先打开一个对话，才能把它设为片头会话',
  'pin.open': '片头片库：查看、预览、切换或添加片头视频',
  'pin.label': '片头动画',
  'pin.set': '已把这个会话设为片头会话',
  'pin.unset': '已取消这个会话的片头设置',

  // ------------------------------------------------------------------ library
  'lib.title': '片头片库',
  'lib.intro': '「▶ 预览」立刻播这一段（不改你的选择）；「选它」把它设为以后开片头时播放的片段。',
  'lib.empty': '（还没找到任何视频）',
  'lib.loading': '（正在读取…）',
  'lib.preview': '▶ 预览',
  'lib.preview.title': '立刻播放这一段，不改变你的选择',
  'lib.select': '选它',
  'lib.select.title': '设为以后开片头时播放的片段',
  'lib.selected': '已选',
  'lib.playing': '播放中',
  'lib.previewing': '预览中',
  'lib.rename': '改名',
  'lib.rename.title': '给这一段起个名字（留空恢复默认）',
  'lib.rename.prompt': '显示名称（留空恢复默认）',
  'lib.delete': '删除',
  'lib.delete.title': '从磁盘上删除这个视频文件',
  'lib.delete.confirm': '确定要从磁盘删除这个文件吗？此操作不可撤销：\n\n{file}',
  'lib.favorite.on': '★',
  'lib.favorite.off': '☆',
  'lib.favorite.title': '收藏：置顶显示',
  'lib.badge.legacy': '原片源',
  'lib.badge.copies': '合并 {n} 份重复',
  'lib.badge.copies.title': '这一段在磁盘上有 {n} 份相同的副本，已合并成一条。你的文件没有被删，只是不重复列出。',
  'lib.badge.faststart': '⚠ 未优化',
  'lib.badge.faststart.title':
    '这个文件的索引表(moov)在末尾：浏览器要整段下载完才出画面，容易黑屏。用 ffmpeg -c copy -movflags +faststart 重排一次即可。',
  'lib.badge.scheduled': '时段',
  'lib.badge.scheduled.title': '有时段规则会用到这一段',
  'lib.badge.readonly': '只读',
  'lib.badge.readonly.title': '这个文件在上一个版本（dsh-boot-animation）的目录里，本插件不会删除它',
  'lib.source.yours': '你自己加的',
  'lib.source.embedded': '插件内置',
  'lib.source.env': '环境变量',
  'lib.source.legacy': '原插件目录',
  'lib.dir.hint': '想加自己的片子：把 mp4 放进这个文件夹，再点「刷新」',
  'lib.playOnce': '▶ 播一次',
  'lib.playOnce.title': '立刻按当前设置播一次',
  'lib.refresh': '刷新',
  'lib.close': '关闭',
  'lib.sort': '排序：',
  'lib.sort.default': '默认',
  'lib.sort.name': '名称',
  'lib.sort.size': '体积',
  'lib.sort.newest': '最新',
  'lib.sort.oldest': '最旧',
  'lib.tab.library': '片库',
  'lib.tab.playback': '播放',
  'lib.tab.trigger': '触发',
  'lib.tab.overlay': '画面',
  'lib.tab.schedule': '时段',
  'lib.tab.interface': '界面',

  // ----------------------------------------------------------------- playback
  'play.fit': '播放方式：',
  'play.fit.cover': '铺满屏幕',
  'play.fit.cover.title': '铺满整个窗口，超出部分裁掉 —— 不留黑边',
  'play.fit.contain': '完整显示',
  'play.fit.contain.title': '完整显示整帧，长宽比不匹配时留黑边',
  'play.random.on': '🎲 随机播放：开',
  'play.random.off': '🎲 随机播放：关',
  'play.random.title': '每次开片头时，从所有可播放的片段里随机挑一段（连续两次不会挑到同一段）',
  'play.volume': '音量',
  'play.muted': '开片时静音',
  'play.muted.title': '浏览器不允许带声音自动播放；关掉这一项后需要点一下画面才有声音',
  'play.rate': '播放速度',
  'play.progress': '显示进度条',
  'play.autoSkip': '自动跳过（秒）',
  'play.autoSkip.title': '开启后画面上会出现倒计时，到点自动关闭；0 表示关闭',
  'play.fade': '片尾淡出（毫秒）',
  'play.fade.title': '播完最后这几毫秒里画面淡出，0 表示直接切断',

  // ------------------------------------------------------------------ trigger
  'trigger.mode': '什么时候播',
  'trigger.mode.new-and-pinned': '新对话一次 + 钉住的会话每次',
  'trigger.mode.new-and-pinned.title': '默认行为：每个新对话只播一次，另外你钉住的那个会话每次打开都播',
  'trigger.mode.new-only': '每个新对话一次',
  'trigger.mode.new-only.title': '只在打开一个还没说过话的新对话时播，忽略图钉',
  'trigger.mode.always': '每次打开会话都播',
  'trigger.mode.always.title': '打开任何一个会话都播一遍（切换会话、刷新页面也算）',
  'trigger.mode.startup-only': '每次启动 DSH 只播一次',
  'trigger.mode.startup-only.title': '一次页面加载里最多播一次，之后打开多少会话都不再播',
  'trigger.mode.off': '不自动播放',
  'trigger.mode.off.title': '只在你手动点「▶ 播一次」或「▶ 预览」时播',
  'trigger.cooldown': '冷却时间（分钟）',
  'trigger.cooldown.title': '距离上一次播放不足这么多分钟时不再自动播；0 表示不限制',
  'trigger.list': '会话名单',
  'trigger.list.off': '不限制',
  'trigger.list.allow': '只在这些会话播',
  'trigger.list.deny': '这些会话不播',
  'trigger.list.count': '名单里有 {n} 个会话',
  'trigger.list.add': '把当前会话加进名单',
  'trigger.list.remove': '把当前会话移出名单',
  'trigger.list.none': '当前没有打开的会话，无法加入名单',
  'trigger.list.inList': '当前会话已在名单里',
  'trigger.list.notInList': '当前会话不在名单里',
  'trigger.list.unknown': '未知会话',

  // ------------------------------------------------------------------ overlay
  'overlay.field.title': '标题',
  'overlay.field.subtitle': '副标题',
  'overlay.field.watermark': '水印',
  'overlay.field.effect': '画面特效',
  'overlay.field.empty': '留空表示不显示',
  'overlay.title.placeholder': '例如：DeepSeek Harness',
  'overlay.subtitle.placeholder': '例如：系统启动中',
  'overlay.watermark.placeholder': '例如：@Yiheng',
  'overlay.effect.none': '无',
  'overlay.effect.scanlines': '扫描线',
  'overlay.effect.vignette': '暗角',
  'overlay.effect.grain': '颗粒',
  'overlay.effect.glow': '辉光',

  // ----------------------------------------------------------------- schedule
  'sched.hint':
    '按星期和时间段自动换片头：命中第一条启用的规则就用那一段，都没命中就走上面的选择/随机。',
  'sched.wrap': '跨越午夜的时间段（例如 22:00 → 02:00）算在「开始的星期」上。',
  'sched.empty': '还没有时段规则。',
  'sched.add': '为选中的片段加一条',
  'sched.needSelection': '先在「片库」里点「选它」，再加规则',
  'sched.label': '备注',
  'sched.label.placeholder': '可选，例如：周五夜',
  'sched.days': '星期',
  'sched.from': '从',
  'sched.to': '到',
  'sched.enable': '启用',
  'sched.remove': '删除这条',
  'sched.allDays': '每天',
  'sched.ruleOf': '规则 {n}',
  'sched.day.0': '日',
  'sched.day.1': '一',
  'sched.day.2': '二',
  'sched.day.3': '三',
  'sched.day.4': '四',
  'sched.day.5': '五',
  'sched.day.6': '六',

  // ---------------------------------------------------------------- interface
  'ui.locale': '界面语言',
  'ui.locale.auto': '跟随浏览器',
  'ui.locale.zh': '中文',
  'ui.locale.en': 'English',
  'ui.version': '插件版本',
  'ui.info': '说明',

  // ------------------------------------------------------------------- status
  'status.saved': '已保存',
  'status.saveFailed': '保存失败：{error}',
  'status.catalogFailed': '读取片库失败：{error}',
  'status.selected': '已选为片头：{name}',
  'status.randomOn': '已开启随机播放',
  'status.randomOff': '已关闭随机播放',
  'status.fitCover': '已设为「铺满屏幕」',
  'status.fitContain': '已设为「完整显示」',
  'status.removed': '已删除：{name}',
  'status.removeFailed': '删除失败：{error}',
  'status.renamed': '已改名为：{name}',
  'status.renameCleared': '已恢复默认名称',
  'status.ruleAdded': '已新增时段规则',
  'status.ruleRemoved': '已删除时段规则',
  'status.favoriteOn': '已收藏',
  'status.favoriteOff': '已取消收藏',
  'status.sessionAdded': '已把当前会话加进名单',
  'status.sessionRemoved': '已把当前会话移出名单',
  'status.listMode': '会话名单：{mode}',
  'status.busy': '正在保存…',
} as const

/** Every message key. Derived, so a missing translation is a compile error. */
export type MessageKey = keyof typeof ZH

const EN: Record<MessageKey, string> = {
  'overlay.loading': 'Loading video…',
  'overlay.stalled': 'Video load timed out',
  'overlay.error': 'Video failed to load — see the [dsh-boot-animation-pro] console log',
  'overlay.skip': 'Skip',
  'overlay.skipIn': 'Skipping in {n}s',
  'overlay.tapToPlay': 'Click to play',
  'overlay.tapForSound': 'Click for sound · full screen',
  'overlay.previewing': 'previewing',

  'reason.preview': 'preview',
  'reason.new-conversation': 'new conversation',
  'reason.pinned': 'pinned conversation',
  'reason.random': 'random',
  'reason.selected': 'chosen intro',
  'reason.active': 'current intro',
  'reason.explicit': 'named clip',
  'reason.fallback': 'fallback',
  'reason.schedule': 'time rule',
  'reason.always': 'every open',
  'reason.startup-only': 'this launch',
  'reason.active-random': 'random',

  'pin.title.on': 'This conversation is the intro conversation: the animation plays every time you open it (click to undo)',
  'pin.title.off': 'Make this the intro conversation: the animation will play every time you open it',
  'pin.title.disabled': 'Open a conversation first, then you can pin it as the intro conversation',
  'pin.open': 'Intro library: browse, preview, switch or add intro videos',
  'pin.label': 'Intro animation',
  'pin.set': 'This conversation now plays the intro',
  'pin.unset': 'This conversation no longer plays the intro',

  'lib.title': 'Intro library',
  'lib.intro': '“▶ Preview” plays that clip right now and changes nothing. “Use it” makes it the clip future intros play.',
  'lib.empty': '(no videos found yet)',
  'lib.loading': '(loading…)',
  'lib.preview': '▶ Preview',
  'lib.preview.title': 'Play this clip now without changing your choice',
  'lib.select': 'Use it',
  'lib.select.title': 'Make this the clip future intros play',
  'lib.selected': 'In use',
  'lib.playing': 'playing',
  'lib.previewing': 'previewing',
  'lib.rename': 'Rename',
  'lib.rename.title': 'Give this clip a display name (empty restores the default)',
  'lib.rename.prompt': 'Display name (empty restores the default)',
  'lib.delete': 'Delete',
  'lib.delete.title': 'Delete this video file from disk',
  'lib.delete.confirm': 'Delete this file from disk? This cannot be undone:\n\n{file}',
  'lib.favorite.on': '★',
  'lib.favorite.off': '☆',
  'lib.favorite.title': 'Favourite: keep this row at the top',
  'lib.badge.legacy': 'legacy drop-in',
  'lib.badge.copies': '{n} duplicates merged',
  'lib.badge.copies.title':
    'This clip exists as {n} identical copies on disk and is listed once. Nothing was deleted; the duplicates are only hidden.',
  'lib.badge.faststart': '⚠ not optimised',
  'lib.badge.faststart.title':
    'The index (moov) sits at the end of this file, so the browser must download all of it before the first frame — the usual cause of a black overlay. Fix it with: ffmpeg -c copy -movflags +faststart.',
  'lib.badge.scheduled': 'scheduled',
  'lib.badge.scheduled.title': 'A time rule plays this clip',
  'lib.badge.readonly': 'read-only',
  'lib.badge.readonly.title':
    "This file lives in the previous version's (dsh-boot-animation) directory; this plugin will not delete it",
  'lib.source.yours': 'yours',
  'lib.source.embedded': 'built in',
  'lib.source.env': 'env var',
  'lib.source.legacy': 'old plugin dir',
  'lib.dir.hint': 'To add your own clip: drop an mp4 into this folder, then press Refresh',
  'lib.playOnce': '▶ Play once',
  'lib.playOnce.title': 'Play one intro right now, using the current settings',
  'lib.refresh': 'Refresh',
  'lib.close': 'Close',
  'lib.sort': 'Sort:',
  'lib.sort.default': 'Default',
  'lib.sort.name': 'Name',
  'lib.sort.size': 'Size',
  'lib.sort.newest': 'Newest',
  'lib.sort.oldest': 'Oldest',
  'lib.tab.library': 'Library',
  'lib.tab.playback': 'Playback',
  'lib.tab.trigger': 'Trigger',
  'lib.tab.overlay': 'Overlay',
  'lib.tab.schedule': 'Schedule',
  'lib.tab.interface': 'Interface',

  'play.fit': 'Fit:',
  'play.fit.cover': 'Fill the screen',
  'play.fit.cover.title': 'Fill the whole window and crop the overflow — no black bars',
  'play.fit.contain': 'Show the whole frame',
  'play.fit.contain.title': 'Show the entire frame, letterboxed when the aspect ratio does not match',
  'play.random.on': '🎲 Random: on',
  'play.random.off': '🎲 Random: off',
  'play.random.title': 'Play a random clip each time (never the same one twice in a row)',
  'play.volume': 'Volume',
  'play.muted': 'Start muted',
  'play.muted.title':
    'Browsers refuse to autoplay with sound. With this off, the audio starts muted and the first click turns it on.',
  'play.rate': 'Speed',
  'play.progress': 'Show a progress bar',
  'play.autoSkip': 'Auto-skip (seconds)',
  'play.autoSkip.title': 'Show a countdown and close the overlay when it runs out. 0 turns it off.',
  'play.fade': 'Fade out (ms)',
  'play.fade.title': 'Fade the last few milliseconds out. 0 cuts straight to the end.',

  'trigger.mode': 'When it plays',
  'trigger.mode.new-and-pinned': 'New conversation once + pinned every time',
  'trigger.mode.new-and-pinned.title': 'The default: each new conversation plays once, plus your pinned conversation every time',
  'trigger.mode.new-only': 'Every new conversation once',
  'trigger.mode.new-only.title': 'Only when a conversation with no turns is opened; the pin is ignored',
  'trigger.mode.always': 'Every time a conversation opens',
  'trigger.mode.always.title': 'Plays whenever any conversation is entered, including switching back and reloading',
  'trigger.mode.startup-only': 'Once per DSH start',
  'trigger.mode.startup-only.title': 'At most one play per page load, whatever you open afterwards',
  'trigger.mode.off': 'Never play automatically',
  'trigger.mode.off.title': 'Only “▶ Play once” and “▶ Preview” play anything',
  'trigger.cooldown': 'Cooldown (minutes)',
  'trigger.cooldown.title': 'Do not auto-play again until this many minutes have passed. 0 disables the limit.',
  'trigger.list': 'Session list',
  'trigger.list.off': 'No restriction',
  'trigger.list.allow': 'Only in these sessions',
  'trigger.list.deny': 'Never in these sessions',
  'trigger.list.count': '{n} session(s) in the list',
  'trigger.list.add': 'Add the current session',
  'trigger.list.remove': 'Remove the current session',
  'trigger.list.none': 'No conversation is open, so there is nothing to add',
  'trigger.list.inList': 'The current session is in the list',
  'trigger.list.notInList': 'The current session is not in the list',
  'trigger.list.unknown': 'unknown session',

  'overlay.field.title': 'Title',
  'overlay.field.subtitle': 'Subtitle',
  'overlay.field.watermark': 'Watermark',
  'overlay.field.effect': 'Effect',
  'overlay.field.empty': 'Leave empty to hide',
  'overlay.title.placeholder': 'e.g. DeepSeek Harness',
  'overlay.subtitle.placeholder': 'e.g. starting up',
  'overlay.watermark.placeholder': 'e.g. @Yiheng',
  'overlay.effect.none': 'None',
  'overlay.effect.scanlines': 'Scanlines',
  'overlay.effect.vignette': 'Vignette',
  'overlay.effect.grain': 'Grain',
  'overlay.effect.glow': 'Glow',

  'sched.hint':
    'Swap intros by weekday and time of day. The first enabled rule that matches wins; when none matches, the selection or random mode above applies.',
  'sched.wrap': 'A window that crosses midnight (e.g. 22:00 → 02:00) counts on the weekday it STARTS.',
  'sched.empty': 'No time rules yet.',
  'sched.add': 'Add a rule for the chosen clip',
  'sched.needSelection': 'Choose a clip with “Use it” in the Library tab first',
  'sched.label': 'Note',
  'sched.label.placeholder': 'optional, e.g. Friday night',
  'sched.days': 'Days',
  'sched.from': 'From',
  'sched.to': 'To',
  'sched.enable': 'Enabled',
  'sched.remove': 'Remove this rule',
  'sched.allDays': 'Every day',
  'sched.ruleOf': 'Rule {n}',
  'sched.day.0': 'Sun',
  'sched.day.1': 'Mon',
  'sched.day.2': 'Tue',
  'sched.day.3': 'Wed',
  'sched.day.4': 'Thu',
  'sched.day.5': 'Fri',
  'sched.day.6': 'Sat',

  'ui.locale': 'Language',
  'ui.locale.auto': 'Follow the browser',
  'ui.locale.zh': '中文',
  'ui.locale.en': 'English',
  'ui.version': 'Plugin version',
  'ui.info': 'About',

  'status.saved': 'Saved',
  'status.saveFailed': 'Could not save: {error}',
  'status.catalogFailed': 'Could not read the library: {error}',
  'status.selected': 'Intro set to: {name}',
  'status.randomOn': 'Random playback is on',
  'status.randomOff': 'Random playback is off',
  'status.fitCover': 'Set to “Fill the screen”',
  'status.fitContain': 'Set to “Show the whole frame”',
  'status.removed': 'Deleted: {name}',
  'status.removeFailed': 'Could not delete: {error}',
  'status.renamed': 'Renamed to: {name}',
  'status.renameCleared': 'Back to the default name',
  'status.ruleAdded': 'Time rule added',
  'status.ruleRemoved': 'Time rule removed',
  'status.favoriteOn': 'Added to favourites',
  'status.favoriteOff': 'Removed from favourites',
  'status.sessionAdded': 'Added the current session to the list',
  'status.sessionRemoved': 'Removed the current session from the list',
  'status.listMode': 'Session list: {mode}',
  'status.busy': 'Saving…',
}

const DICTIONARIES: Record<ResolvedLocale, Record<MessageKey, string>> = { zh: ZH, en: EN }

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
export function resolveLocale(setting: Locale, browserLanguage?: string): ResolvedLocale {
  if (setting === 'zh' || setting === 'en') return setting
  const candidate =
    browserLanguage ??
    (() => {
      try {
        return typeof navigator === 'undefined' ? undefined : navigator.language
      } catch {
        return undefined
      }
    })()
  return typeof candidate === 'string' && candidate.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** Substitute `{name}` placeholders. An unknown placeholder is left visible. */
export function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole,
  )
}

/** A translator bound to one language. */
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function translatorFor(locale: ResolvedLocale): Translate {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.zh
  return (key, params) => formatMessage(dictionary[key] ?? key, params)
}

/** Both dictionaries, so a test can prove they define exactly the same keys. */
export const CATALOGS: Record<ResolvedLocale, Record<string, string>> = { zh: ZH, en: EN }
