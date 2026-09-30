import { startHarness } from './lib/harness.mjs'
const BASE = '/dsh-boot-animation-pro'
const h = await startHarness()
const post = async (p, b) => (await h.request('POST', p, { body: b })).json()
console.log('--- defaults ---')
const list = (await h.request('GET', `${BASE}/videos.json`)).json()
console.log('schema.version =', list.selectionVersion, '| triggerMode =', list.triggerMode ?? list.settings.triggerMode)
console.log('schema enums =', JSON.stringify(list.schema))
console.log('--- patch many fields ---')
console.log(JSON.stringify(await post(`${BASE}/select`, {
  volume: 0.35, muted: false, playbackRate: 1.5, showProgress: false,
  autoSkipSeconds: 8, fadeOutMs: 1200, triggerMode: 'always', cooldownMinutes: 30,
  overlayTitle: 'DSH', overlaySubtitle: '系统启动', watermark: '@Yiheng',
  overlayEffect: 'scanlines', sortMode: 'name', locale: 'en',
}), null, 1).slice(0, 200))
console.log('--- alias + favourite ---')
console.log(await post(`${BASE}/select`, { alias: { clipId: 'builtin:brand', name: '我的品牌片头' } }))
console.log(await post(`${BASE}/select`, { toggleFavorite: 'builtin:brand' }))
console.log('--- time rule ---')
console.log(await post(`${BASE}/select`, { addTimeRule: { clipId: 'builtin:cyberpunk', days: [5], start: '22:00', end: '02:00', label: '周五夜' } }))
const after = (await h.request('GET', `${BASE}/videos.json`)).json()
console.log('aliased row:', after.videos.find(v => v.id === 'builtin:brand')?.name, '| fav:', after.videos.find(v => v.id === 'builtin:brand')?.favorite)
console.log('sortMode=name order:', after.videos.map(v => v.name).join(' | '))
console.log('timeRules:', JSON.stringify(after.settings.timeRules))
console.log('--- schedule resolve ---')
console.log((await h.request('GET', `${BASE}/resolve.json?mode=schedule`)).json())
console.log('--- rejection paths ---')
const bad = async (b) => { const r = await h.request('POST', `${BASE}/select`, { body: b }); return `${r.status} ${r.json().error ?? ''}` }
console.log('unknown field      :', await bad({ nope: 1 }))
console.log('unknown clip       :', await bad({ selectedClipId: 'builtin:nope' }))
console.log('bad enum           :', await bad({ triggerMode: 'sometimes' }))
console.log('bad time           :', await bad({ addTimeRule: { clipId: 'builtin:brand', start: '25:00', end: '02:00' } }))
console.log('version not writable:', await bad({ version: 99 }))
console.log('sessionList        :', await bad({ sessionList: { mode: 'deny', ids: ['../etc'] } }))
console.log('--- remove (embedded must be refused) ---')
const rm = await h.request('POST', `${BASE}/remove`, { body: { clipId: 'builtin:brand' } })
console.log(rm.status, rm.json().error)
console.log('--- legacy selection import ---')
await h.close()
