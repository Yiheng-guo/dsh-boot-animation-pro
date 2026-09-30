/**
 * The built-in clips: one id, one name, one source file.
 *
 * This mapping used to live only inside `embed-clips.mjs`, which was fine while
 * embedding was the only thing that needed it. `extract-clips.mjs` needs the SAME
 * mapping in the opposite direction, and two hand-maintained copies of an
 * id-to-filename table is exactly how a clip silently stops round-tripping. So it
 * lives here and both scripts import it.
 */
export const CLIP_SOURCES = [
  { id: 'brand', file: 'media/deepseek-brand-intro.mp4', name: 'DeepSeek 品牌片头' },
  { id: 'cyberpunk', file: 'media/deepseek-cyberpunk-intro.mp4', name: 'DeepSeek 赛博朋克片头' },
  { id: 'awakening', file: 'media/deepseek-awakening-intro.mp4', name: 'DeepSeek 数字角色苏醒' },
  { id: 'startup', file: 'media/deepseek-startup-intro.mp4', name: 'DeepSeek 启动问题' },
]
