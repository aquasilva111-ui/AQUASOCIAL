import './new-posts-pill.css'

import {useEffect, useRef} from 'react'
import {type AppBskyActorDefs} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {useGate} from '#/lib/statsig/statsig'
import {useSession} from '#/state/session'
import {DOCK_HEIGHT, DOCK_INSET} from '#/view/shell/bottom-bar/BottomBarStyles'
import {useLayoutBreakpoints, useTheme} from '#/alf'
import {ArrowTop_Stroke2_Corner0_Rounded as ArrowIcon} from '#/components/icons/Arrow'
import {CENTER_COLUMN_OFFSET} from '#/components/Layout/const'

/** Pixels of scroll at which the pill is fully shown. */
const FULL_AT = 700
const GAP_ABOVE_DOCK = 12
const SLIDE_PX = 26

/**
 * The "new posts" pill, wide web only. It sits just above the bottom dock and
 * is tied to how far down the feed you are: nothing near the top, then it
 * rises out from behind the dock, gaining size and opacity the deeper you
 * scroll, as a nudge to go back up and refresh. Tapping it does that.
 *
 * Styles are written straight to the element on scroll (no React re-render).
 */
export function ScrollDepthPill({
  authors,
  onPress,
  label,
  text,
}: {
  authors: AppBskyActorDefs.ProfileViewBasic[]
  onPress: () => void
  label: string
  /** Replaces the default "posted" text (used when there are no avatars). */
  text?: string
}) {
  const theme = useTheme()
  const {_} = useLingui()
  const gate = useGate()
  const {hasSession} = useSession()
  const {centerColumnOffset, leftNavMinimal} = useLayoutBreakpoints()
  const ref = useRef<HTMLButtonElement>(null)
  const hidden = gate('remove_show_latest_button')
  const postedLabel = text ?? _(msg`posted`)
  const dockVisible = hasSession || leftNavMinimal
  const bottom = dockVisible ? DOCK_INSET + DOCK_HEIGHT + GAP_ABOVE_DOCK : 24
  const shiftX = centerColumnOffset ? CENTER_COLUMN_OFFSET : 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const paint = () => {
      frame = 0
      const p = Math.min(1, Math.max(0, window.scrollY / FULL_AT))
      const visible = p > 0.25
      el.style.opacity = String(Math.min(1, p * 1.6))
      el.style.pointerEvents = visible ? 'auto' : 'none'
      el.tabIndex = visible ? 0 : -1
      el.setAttribute('aria-hidden', visible ? 'false' : 'true')
      el.style.transform = `translateX(calc(-50% + ${shiftX}px)) translateY(${(
        (1 - p) *
        SLIDE_PX
      ).toFixed(1)}px) scale(${(0.85 + 0.15 * p).toFixed(3)})`
      el.classList.toggle('is-full', p >= 1)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    window.addEventListener('scroll', onScroll, {passive: true})
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [shiftX, hidden])

  if (hidden) return null

  return (
    <button
      ref={ref}
      type="button"
      className="new-posts-pill new-posts-pill-depth"
      data-theme={theme.name}
      style={{bottom}}
      onClick={onPress}
      aria-label={label}>
      <ArrowIcon width={14} fill="currentColor" aria-hidden />
      {authors.length > 0 && (
        <span className="new-posts-pill-avatars" aria-hidden>
          {authors
            .slice(0, 3)
            .map(author =>
              author.avatar ? (
                <img key={author.did} src={author.avatar} alt="" />
              ) : null,
            )}
        </span>
      )}
      <span>{postedLabel}</span>
    </button>
  )
}
