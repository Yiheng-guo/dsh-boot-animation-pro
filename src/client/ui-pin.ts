/**
 * The pin, and the picker's opener, at the sidebar foot.
 *
 * Two buttons in one cell, and the difference between them is the whole point:
 * the pin is about THIS conversation, the picker is about every conversation.
 * They were almost merged once, which made "make this one play every time" and
 * "choose which clip plays" the same click.
 */
import type { ReactElement } from 'react'
import { createElement as h, useMemo, useState } from 'react'
import { log } from './diagnostics.js'
import { resolveLocale, translatorFor } from './i18n.js'
import { readPinned, useCurrentSession, writePinned, type CurrentStore } from './session.js'
import { useClientStore, type ClientStore } from './store.js'
import { ensureStyle } from './styles.js'

export function PinAction({
  store,
  sessionStore,
  onOpen,
}: {
  store: ClientStore
  sessionStore: CurrentStore | null
  onOpen: () => void
}): ReactElement {
  ensureStyle()
  const snapshot = useClientStore(store)
  const t = useMemo(() => translatorFor(resolveLocale(snapshot.settings.locale)), [snapshot.settings.locale])
  const { sessionId } = useCurrentSession(sessionStore)
  const [pinned, setPinned] = useState<string | null>(() => readPinned())
  const isPinned = sessionId !== null && pinned === sessionId

  const toggle = (): void => {
    const next = isPinned ? null : sessionId
    writePinned(next)
    setPinned(next)
    log('pin toggled', { from: pinned, to: next })
    store.setStatus(isPinned ? 'pin.unset' : 'pin.set', 'dbap-ok')
  }

  const title = sessionId === null ? t('pin.title.disabled') : isPinned ? t('pin.title.on') : t('pin.title.off')

  return h(
    'span',
    { className: 'dbap-pin-wrap', style: { display: 'inline-flex', alignItems: 'center' } },
    h(
      'button',
      {
        type: 'button',
        className: isPinned ? 'dbap-pin dbap-pin-on' : 'dbap-pin',
        title,
        'aria-label': title,
        disabled: sessionId === null,
        onClick: toggle,
      },
      isPinned ? '🎬' : '🎞',
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dbap-pin dbap-lib-open',
        title: t('pin.open'),
        'aria-label': t('pin.open'),
        onClick: onOpen,
      },
      '🎛',
    ),
  )
}
