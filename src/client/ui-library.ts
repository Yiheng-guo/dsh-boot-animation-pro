/**
 * The picker: one clip list, five settings tabs.
 *
 * Each row can be PREVIEWED (play it now, change nothing) or SELECTED (make it
 * the clip that future overlays play). Those are two different buttons on
 * purpose: they used to be one click that did the second while looking like the
 * first, which is why "preview" appeared to play the wrong video.
 *
 * Every control here obeys the same rule as the row buttons: it builds a patch
 * and hands it to `store.save()`, and what the panel then shows is the HOST's
 * answer, not the click. That is what keeps a rejected write (an unknown enum, a
 * clip that disappeared between listing and click) visible as a failure instead
 * of as a switch that silently flicked back on the next read.
 */
import type { ReactElement } from 'react'
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react'
import { resolveLocale, translatorFor } from './i18n.js'
import type { MessageKey } from './i18n.js'
import { setSkipKeysEnabled } from './ui-overlay.js'
import {
  COOLDOWN_RANGE,
  FADE_RANGE,
  OVERLAY_EFFECTS,
  RATE_RANGE,
  SESSION_LIST_MODES,
  SORT_MODES,
  TRIGGER_MODES,
  useClientStore,
  type ClientStore,
  type ClipInfo,
  type OverlayEffect,
  type SessionListMode,
  type Settings,
  type SortMode,
  type TimeRule,
  type TriggerMode,
} from './store.js'
import { ensureStyle } from './styles.js'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

/** Where a clip comes from, as one word a user can act on. */
const SOURCE_LABEL_KEY: Record<string, MessageKey> = {
  yours: 'lib.source.yours',
  embedded: 'lib.source.embedded',
  env: 'lib.source.env',
  legacy: 'lib.source.legacy',
}

/** Why this clip is on screen, in words. */
const SOURCE_FALLBACK: MessageKey = 'lib.source.yours'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/**
 * A text input that writes on blur or Enter, never on every keystroke.
 *
 * Without the local buffer, typing a title into an input bound straight to the
 * store would fire one write per character and fight the re-read that follows
 * each one, which is how a field ends up dropping the character you just typed.
 */
function TextField({
  label,
  value,
  placeholder,
  hint,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  hint?: string
  onCommit: (next: string) => void
}): ReactElement {
  const [text, setText] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  return h(
    'label',
    { className: 'dbap-field' },
    h('span', { className: 'dbap-field-label' }, label, hint === undefined ? null : h('em', null, ' ' + hint)),
    h('input', {
      type: 'text',
      className: 'dbap-input',
      value: text,
      placeholder: placeholder ?? '',
      onFocus: () => {
        focused.current = true
      },
      onChange: (event: { target: { value: string } }) => setText(event.target.value),
      onKeyDown: (event: { key: string; target: { blur: () => void } }) => {
        if (event.key === 'Enter') event.target.blur()
      },
      onBlur: () => {
        focused.current = false
        if (text !== value) onCommit(text)
      },
    }),
  )
}

/** A number input with a range and a unit, committed on blur or Enter. */
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  hint,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  hint?: string
  onCommit: (next: number) => void
}): ReactElement {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  const commit = (): void => {
    const parsed = Number(text)
    if (!Number.isFinite(parsed)) {
      setText(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, parsed))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return h(
    'label',
    { className: 'dbap-field' },
    h('span', { className: 'dbap-field-label' }, label, hint === undefined ? null : h('em', null, ' ' + hint)),
    h('input', {
      type: 'number',
      className: 'dbap-input dbap-num',
      value: text,
      min,
      max,
      step,
      onFocus: () => {
        focused.current = true
      },
      onChange: (event: { target: { value: string } }) => setText(event.target.value),
      onKeyDown: (event: { key: string; target: { blur: () => void } }) => {
        if (event.key === 'Enter') event.target.blur()
      },
      onBlur: () => {
        focused.current = false
        commit()
      },
    }),
  )
}

/** A slider that writes on release, so dragging does not flood the host. */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (next: number) => void
}): ReactElement {
  const [local, setLocal] = useState(value)
  const dragging = useRef(false)
  useEffect(() => {
    if (!dragging.current) setLocal(value)
  }, [value])
  return h(
    'label',
    { className: 'dbap-field' },
    h('span', { className: 'dbap-field-label' }, `${label} ${String(Math.round(local * 100) / 100)}`),
    h('input', {
      type: 'range',
      className: 'dbap-range',
      value: local,
      min,
      max,
      step,
      onChange: (event: { target: { value: string } }) => {
        dragging.current = true
        setLocal(Number(event.target.value))
      },
      onPointerUp: () => {
        dragging.current = false
        if (local !== value) onCommit(local)
      },
      onKeyUp: () => {
        dragging.current = false
        if (local !== value) onCommit(local)
      },
    }),
  )
}

/** A checkbox bound to one boolean setting. */
function ToggleField({
  label,
  value,
  title,
  onCommit,
}: {
  label: string
  value: boolean
  title?: string
  onCommit: (next: boolean) => void
}): ReactElement {
  return h(
    'label',
    { className: 'dbap-toggle', title },
    h('input', { type: 'checkbox', checked: value, onChange: (event: { target: { checked: boolean } }) => onCommit(event.target.checked) }),
    h('span', null, label),
  )
}

/** The panel. */
export function VideoLibrary({
  store,
  sessionId,
  onClose,
}: {
  store: ClientStore
  sessionId: string | null
  onClose: () => void
}): ReactElement {
  ensureStyle()
  const snapshot = useClientStore(store)
  const settings: Settings = snapshot.settings
  const t = useMemo(() => translatorFor(resolveLocale(settings.locale)), [settings.locale])
  const clips = snapshot.catalog?.clips ?? []
  const selectedClipId = settings.selectedClipId
  const playingClipId = snapshot.playback.clipId
  const previewClipId = snapshot.playback.previewClipId
  const busy = snapshot.busy

  const [tab, setTab] = useState<'library' | 'playback' | 'trigger' | 'overlay' | 'schedule' | 'interface'>('library')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [draftDays, setDraftDays] = useState<number[]>(ALL_DAYS)
  const [draftStart, setDraftStart] = useState('09:00')
  const [draftEnd, setDraftEnd] = useState('18:00')
  const [draftLabel, setDraftLabel] = useState('')

  // Escape closes the panel and must not also skip the intro behind it.
  useEffect(() => {
    setSkipKeysEnabled(false)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      setSkipKeysEnabled(true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null
  const scheduledIds = new Set(
    settings.timeRules.filter((rule) => rule.enabled).map((rule) => rule.clipId),
  )
  const sessionListed = sessionId !== null && settings.sessionList.ids.includes(sessionId)

  /** Delete is the one action here that destroys something, so it confirms. */
  const confirmRemove = (clip: ClipInfo): void => {
    const target = clip.file ?? clip.name
    if (!window.confirm(t('lib.delete.confirm', { file: target }))) return
    void store.removeClip(clip.id)
  }

  const clipRow = (clip: ClipInfo): ReactElement => {
    const isSelected = clip.id === selectedClipId
    const sourceKey = SOURCE_LABEL_KEY[clip.source] ?? SOURCE_FALLBACK
    return h(
      'div',
      {
        key: clip.id,
        className: 'dbap-item' + (isSelected ? ' dbap-cur' : ''),
        title: clip.file ?? clip.id,
      },
      h('span', { className: 'dbap-mark' }, isSelected ? '✓' : ''),
      renamingId === clip.id
        ? h('input', {
            type: 'text',
            className: 'dbap-input dbap-inline-rename',
            value: renameText,
            autoFocus: true,
            placeholder: clip.originalName ?? clip.name,
            onChange: (event: { target: { value: string } }) => setRenameText(event.target.value),
            onKeyDown: (event: { key: string }) => {
              if (event.key === 'Enter') {
                void store.renameClip(clip.id, renameText)
                setRenamingId(null)
              } else if (event.key === 'Escape') {
                setRenamingId(null)
              }
            },
            onBlur: () => {
              setRenamingId(null)
            },
          })
        : h('span', { className: 'dbap-nm' }, clip.name),
      clip.renamed === true ? h('span', { className: 'dbap-badge' }, '✎') : null,
      clip.id === playingClipId
        ? h('span', { className: 'dbap-badge dbap-b-sel' }, previewClipId === clip.id ? t('lib.previewing') : t('lib.playing'))
        : null,
      clip.legacy ? h('span', { className: 'dbap-badge' }, t('lib.badge.legacy')) : null,
      (clip.copies ?? 1) > 1
        ? h(
            'span',
            { className: 'dbap-badge', title: t('lib.badge.copies.title', { n: clip.copies ?? 1 }) },
            t('lib.badge.copies', { n: clip.copies ?? 1 }),
          )
        : null,
      (clip.ext === '.mp4' || clip.ext === '.m4v') && clip.faststart === false
        ? h('span', { className: 'dbap-badge dbap-b-warn', title: t('lib.badge.faststart.title') }, t('lib.badge.faststart'))
        : null,
      scheduledIds.has(clip.id) ? h('span', { className: 'dbap-badge dbap-b-prev', title: t('lib.badge.scheduled.title') }, t('lib.badge.scheduled')) : null,
      h('span', { className: 'dbap-badge' }, t(sourceKey)),
      clip.removable !== true && clip.kind === 'file'
        ? h('span', { className: 'dbap-badge', title: t('lib.badge.readonly.title') }, t('lib.badge.readonly'))
        : null,
      h('span', { className: 'dbap-meta' }, formatBytes(clip.bytes)),
      h(
        'button',
        {
          type: 'button',
          className: 'dbap-row-btn dbap-star' + (clip.favorite === true ? ' dbap-star-on' : ''),
          title: t('lib.favorite.title'),
          onClick: () => void store.toggleFavorite(clip.id),
        },
        clip.favorite === true ? t('lib.favorite.on') : t('lib.favorite.off'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dbap-row-btn',
          title: t('lib.preview.title'),
          onClick: () => {
            store.preview(clip.id)
          },
        },
        t('lib.preview'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dbap-row-btn' + (isSelected ? '' : ' dbap-go'),
          disabled: busy || isSelected,
          title: t('lib.select.title'),
          onClick: () => {
            if (!busy) void store.selectClip(clip.id)
          },
        },
        isSelected ? t('lib.selected') : t('lib.select'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dbap-row-btn',
          title: t('lib.rename.title'),
          onClick: () => {
            setRenamingId(clip.id)
            setRenameText(clip.renamed === true ? clip.name : '')
          },
        },
        t('lib.rename'),
      ),
      clip.removable === true
        ? h(
            'button',
            {
              type: 'button',
              className: 'dbap-row-btn dbap-danger',
              title: t('lib.delete.title'),
              onClick: () => confirmRemove(clip),
            },
            t('lib.delete'),
          )
        : null,
    )
  }

  const libraryTab = [
    h('p', { key: 'intro' }, t('lib.intro')),
    h(
      'div',
      { key: 'sort', className: 'dbap-choice dbap-sort' },
      h('span', { className: 'dbap-choice-label' }, t('lib.sort')),
      ...SORT_MODES.map((mode: SortMode) =>
        h(
          'button',
          {
            key: mode,
            type: 'button',
            className: 'dbap-btn' + (settings.sortMode === mode ? ' dbap-btn-on' : ''),
            onClick: () => void store.save({ sortMode: mode }, 'status.saved'),
          },
          t(`lib.sort.${mode}` as MessageKey),
        ),
      ),
    ),
    ...(clips.length === 0
      ? [h('div', { key: 'empty', className: 'dbap-item' }, h('span', { className: 'dbap-nm' }, snapshot.loading ? t('lib.loading') : t('lib.empty')))]
      : clips.map(clipRow)),
    h(
      'div',
      { key: 'dir', className: 'dbap-dir' },
      t('lib.dir.hint'),
      h('br', null),
      h('code', null, snapshot.catalog?.userDir ?? '…'),
    ),
  ]

  const playbackTab = [
    h(
      'div',
      { key: 'fit', className: 'dbap-choice' },
      h('span', { className: 'dbap-choice-label' }, t('play.fit')),
      ...(['cover', 'contain'] as const).map((mode) =>
        h(
          'button',
          {
            key: mode,
            type: 'button',
            className: 'dbap-btn' + (settings.fitMode === mode ? ' dbap-btn-on' : ''),
            title: mode === 'cover' ? t('play.fit.cover.title') : t('play.fit.contain.title'),
            onClick: () => void store.setFitMode(mode),
          },
          mode === 'cover' ? t('play.fit.cover') : t('play.fit.contain'),
        ),
      ),
    ),
    h(
      'div',
      { key: 'random' },
      h(
        'button',
        {
          type: 'button',
          className: 'dbap-btn' + (settings.randomPlayback ? ' dbap-btn-on' : ''),
          title: t('play.random.title'),
          onClick: () => void store.setRandomPlayback(!settings.randomPlayback),
        },
        settings.randomPlayback ? t('play.random.on') : t('play.random.off'),
      ),
    ),
    h(SliderField, {
      key: 'volume',
      label: t('play.volume'),
      value: settings.volume,
      min: 0,
      max: 1,
      step: 0.05,
      onCommit: (next: number) => void store.save({ volume: next }, 'status.saved'),
    }),
    h(ToggleField, {
      key: 'muted',
      label: t('play.muted'),
      title: t('play.muted.title'),
      value: settings.muted,
      onCommit: (next: boolean) => void store.save({ muted: next }, 'status.saved'),
    }),
    h(NumberField, {
      key: 'rate',
      label: t('play.rate'),
      value: settings.playbackRate,
      min: RATE_RANGE[0],
      max: RATE_RANGE[1],
      step: 0.25,
      onCommit: (next: number) => void store.save({ playbackRate: next }, 'status.saved'),
    }),
    h(ToggleField, {
      key: 'progress',
      label: t('play.progress'),
      value: settings.showProgress,
      onCommit: (next: boolean) => void store.save({ showProgress: next }, 'status.saved'),
    }),
    h(NumberField, {
      key: 'autoskip',
      label: t('play.autoSkip'),
      hint: t('play.autoSkip.title'),
      value: settings.autoSkipSeconds,
      min: 0,
      max: 60,
      onCommit: (next: number) => void store.save({ autoSkipSeconds: next }, 'status.saved'),
    }),
    h(NumberField, {
      key: 'fade',
      label: t('play.fade'),
      hint: t('play.fade.title'),
      value: settings.fadeOutMs,
      min: FADE_RANGE[0],
      max: FADE_RANGE[1],
      step: 50,
      onCommit: (next: number) => void store.save({ fadeOutMs: next }, 'status.saved'),
    }),
  ]

  const triggerTab = [
    h(
      'div',
      { key: 'mode', className: 'dbap-stack' },
      h('span', { className: 'dbap-choice-label' }, t('trigger.mode')),
      ...TRIGGER_MODES.map((mode: TriggerMode) =>
        h(
          'button',
          {
            key: mode,
            type: 'button',
            className: 'dbap-btn dbap-wide' + (settings.triggerMode === mode ? ' dbap-btn-on' : ''),
            title: t(`trigger.mode.${mode}.title` as MessageKey),
            onClick: () => void store.save({ triggerMode: mode }, 'status.saved'),
          },
          t(`trigger.mode.${mode}` as MessageKey),
        ),
      ),
    ),
    h(NumberField, {
      key: 'cooldown',
      label: t('trigger.cooldown'),
      hint: t('trigger.cooldown.title'),
      value: settings.cooldownMinutes,
      min: COOLDOWN_RANGE[0],
      max: COOLDOWN_RANGE[1],
      step: 5,
      onCommit: (next: number) => void store.save({ cooldownMinutes: next }, 'status.saved'),
    }),
    h(
      'div',
      { key: 'list', className: 'dbap-stack' },
      h('span', { className: 'dbap-choice-label' }, t('trigger.list')),
      h(
        'div',
        { className: 'dbap-choice' },
        ...SESSION_LIST_MODES.map((mode: SessionListMode) =>
          h(
            'button',
            {
              key: mode,
              type: 'button',
              className: 'dbap-btn' + (settings.sessionList.mode === mode ? ' dbap-btn-on' : ''),
              onClick: () => void store.save({ sessionListOp: { op: 'mode', mode } }, 'status.listMode', {
                mode: t(`trigger.list.${mode}` as MessageKey),
              }),
            },
            t(`trigger.list.${mode}` as MessageKey),
          ),
        ),
      ),
      h(
        'div',
        { className: 'dbap-choice' },
        h('span', { className: 'dbap-meta' }, t('trigger.list.count', { n: settings.sessionList.ids.length })),
        h(
          'button',
          {
            type: 'button',
            className: 'dbap-btn',
            disabled: sessionId === null || busy,
            title: sessionId === null ? t('trigger.list.none') : sessionListed ? t('trigger.list.inList') : t('trigger.list.notInList'),
            onClick: () => {
              if (sessionId === null || busy) return
              void store.save(
                { sessionListOp: { op: sessionListed ? 'remove' : 'add', id: sessionId } },
                sessionListed ? 'status.sessionRemoved' : 'status.sessionAdded',
              )
            },
          },
          sessionListed ? t('trigger.list.remove') : t('trigger.list.add'),
        ),
      ),
    ),
  ]

  const overlayTab = [
    h(TextField, {
      key: 'title',
      label: t('overlay.field.title'),
      hint: t('overlay.field.empty'),
      placeholder: t('overlay.title.placeholder'),
      value: settings.overlayTitle,
      onCommit: (next: string) => void store.save({ overlayTitle: next }, 'status.saved'),
    }),
    h(TextField, {
      key: 'subtitle',
      label: t('overlay.field.subtitle'),
      hint: t('overlay.field.empty'),
      placeholder: t('overlay.subtitle.placeholder'),
      value: settings.overlaySubtitle,
      onCommit: (next: string) => void store.save({ overlaySubtitle: next }, 'status.saved'),
    }),
    h(TextField, {
      key: 'watermark',
      label: t('overlay.field.watermark'),
      hint: t('overlay.field.empty'),
      placeholder: t('overlay.watermark.placeholder'),
      value: settings.watermark,
      onCommit: (next: string) => void store.save({ watermark: next }, 'status.saved'),
    }),
    h(
      'div',
      { key: 'effect', className: 'dbap-choice dbap-wrap' },
      h('span', { className: 'dbap-choice-label' }, t('overlay.field.effect')),
      ...OVERLAY_EFFECTS.map((effect: OverlayEffect) =>
        h(
          'button',
          {
            key: effect,
            type: 'button',
            className: 'dbap-btn' + (settings.overlayEffect === effect ? ' dbap-btn-on' : ''),
            onClick: () => void store.save({ overlayEffect: effect }, 'status.saved'),
          },
          t(`overlay.effect.${effect}` as MessageKey),
        ),
      ),
    ),
  ]

  const ruleRow = (rule: TimeRule): ReactElement => {
    const clip = clips.find((entry) => entry.id === rule.clipId)
    return h(
      'div',
      { key: rule.id, className: 'dbap-rule' + (rule.enabled ? '' : ' dbap-rule-off') },
      h(
        'div',
        { className: 'dbap-rule-top' },
        h('span', { className: 'dbap-nm' }, rule.label === '' ? t('sched.ruleOf', { n: settings.timeRules.indexOf(rule) + 1 }) : rule.label),
        h('span', { className: 'dbap-meta' }, clip?.name ?? rule.clipId),
      ),
      h(
        'div',
        { className: 'dbap-rule-bottom' },
        h('span', { className: 'dbap-meta' }, `${t('sched.days')} ${rule.days.length === 7 ? t('sched.allDays') : rule.days.map((day) => t(`sched.day.${day}` as MessageKey)).join(' ')}`),
        h('span', { className: 'dbap-meta' }, `${rule.start} → ${rule.end}`),
        h(
          'button',
          {
            type: 'button',
            className: 'dbap-btn' + (rule.enabled ? ' dbap-btn-on' : ''),
            onClick: () => void store.save({ setTimeRuleEnabled: { id: rule.id, enabled: !rule.enabled } }, 'status.saved'),
          },
          t('sched.enable'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dbap-btn dbap-danger',
            onClick: () => void store.save({ removeTimeRule: rule.id }, 'status.ruleRemoved'),
          },
          t('sched.remove'),
        ),
      ),
    )
  }

  const scheduleTab = [
    h('p', { key: 'hint' }, t('sched.hint')),
    h('p', { key: 'wrap', className: 'dbap-dim' }, t('sched.wrap')),
    ...(settings.timeRules.length === 0 ? [h('div', { key: 'empty', className: 'dbap-item' }, h('span', { className: 'dbap-nm' }, t('sched.empty')))] : settings.timeRules.map(ruleRow)),
    h(
      'div',
      { key: 'add', className: 'dbap-rule dbap-rule-new' },
      h(
        'div',
        { className: 'dbap-rule-top' },
        h('span', { className: 'dbap-nm' }, t('sched.add')),
        h('span', { className: 'dbap-meta' }, selectedClip === null ? t('sched.needSelection') : selectedClip.name),
      ),
      h(
        'div',
        { className: 'dbap-rule-bottom' },
        ...ALL_DAYS.map((day) =>
          h(
            'button',
            {
              key: day,
              type: 'button',
              className: 'dbap-btn dbap-day' + (draftDays.includes(day) ? ' dbap-btn-on' : ''),
              onClick: () =>
                setDraftDays((current) => (current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day].sort((a, b) => a - b))),
            },
            t(`sched.day.${day}` as MessageKey),
          ),
        ),
        h('span', { className: 'dbap-meta' }, t('sched.from')),
        h('input', { type: 'time', className: 'dbap-input dbap-time', value: draftStart, onChange: (event: { target: { value: string } }) => setDraftStart(event.target.value) }),
        h('span', { className: 'dbap-meta' }, t('sched.to')),
        h('input', { type: 'time', className: 'dbap-input dbap-time', value: draftEnd, onChange: (event: { target: { value: string } }) => setDraftEnd(event.target.value) }),
        h('input', {
          type: 'text',
          className: 'dbap-input dbap-rule-label',
          value: draftLabel,
          placeholder: t('sched.label.placeholder'),
          onChange: (event: { target: { value: string } }) => setDraftLabel(event.target.value),
        }),
        h(
          'button',
          {
            type: 'button',
            className: 'dbap-btn dbap-go',
            disabled: selectedClip === null || draftDays.length === 0 || busy,
            onClick: () => {
              if (selectedClip === null) return
              void store
                .save(
                  { addTimeRule: { clipId: selectedClip.id, days: draftDays, start: draftStart, end: draftEnd, label: draftLabel } },
                  'status.ruleAdded',
                )
                .then(() => setDraftLabel(''))
            },
          },
          t('sched.add'),
        ),
      ),
    ),
  ]

  const interfaceTab = [
    h(
      'div',
      { key: 'locale', className: 'dbap-choice dbap-wrap' },
      h('span', { className: 'dbap-choice-label' }, t('ui.locale')),
      ...(['auto', 'zh', 'en'] as const).map((locale) =>
        h(
          'button',
          {
            key: locale,
            type: 'button',
            className: 'dbap-btn' + (settings.locale === locale ? ' dbap-btn-on' : ''),
            onClick: () => void store.save({ locale }, 'status.saved'),
          },
          t(`ui.locale.${locale}` as MessageKey),
        ),
      ),
    ),
    h(
      'dl',
      { key: 'about', className: 'dbap-about' },
      h('dt', null, t('ui.info')),
      h('dd', null, 'dsh-boot-animation-pro · schema v' + String(settings.version)),
      h('dd', null, h('code', null, snapshot.catalog?.userDir ?? '…')),
    ),
  ]

  const TABS = [
    ['library', libraryTab],
    ['playback', playbackTab],
    ['trigger', triggerTab],
    ['overlay', overlayTab],
    ['schedule', scheduleTab],
    ['interface', interfaceTab],
  ] as const

  const active = TABS.find(([name]) => name === tab) ?? TABS[0]

  return h(
    'div',
    {
      className: 'dbap-veil',
      onClick: (event: { target: unknown; currentTarget: unknown }) => {
        if (event.target === event.currentTarget) onClose()
      },
    },
    h(
      'div',
      { className: 'dbap-lib', onClick: (event: { stopPropagation: () => void }) => event.stopPropagation() },
      h('h3', null, t('lib.title')),
      h(
        'div',
        { className: 'dbap-tabs' },
        ...TABS.map(([name]) =>
          h(
            'button',
            {
              key: name,
              type: 'button',
              className: 'dbap-tab' + (name === tab ? ' dbap-tab-on' : ''),
              onClick: () => setTab(name),
            },
            t(`lib.tab.${name}` as MessageKey),
          ),
        ),
      ),
      h('div', { className: 'dbap-body' }, ...active[1]),
      h(
        'div',
        { className: 'dbap-bar' },
        h(
          'button',
          {
            type: 'button',
            className: 'dbap-btn',
            title: t('lib.playOnce.title'),
            onClick: () => void store.playMode(settings.randomPlayback ? 'random' : 'selected', 'active'),
          },
          t('lib.playOnce'),
        ),
        h('button', { type: 'button', className: 'dbap-btn', onClick: () => void store.loadCatalog() }, t('lib.refresh')),
        h('button', { type: 'button', className: 'dbap-btn', onClick: onClose }, t('lib.close')),
      ),
      h('div', { className: 'dbap-msg ' + snapshot.status.kind }, snapshot.status.key === null ? '' : t(snapshot.status.key, snapshot.status.params)),
    ),
  )
}
