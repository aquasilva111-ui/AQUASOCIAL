import './feed-experience.css'

import {useEffect, useId, useRef, useState} from 'react'

import {
  FEED_EXPERIENCE_MODES,
  useFeedExperience,
  useSetFeedExperience,
} from '#/state/shell/feed-experience'
import {useTheme} from '#/alf'
import {ChevronBottom_Stroke2_Corner0_Rounded as Chevron} from '#/components/icons/Chevron'
import {DotGrid_Stroke2_Corner0_Rounded as DotGrid} from '#/components/icons/DotGrid'
import {Drop_Filled_Corner0_Rounded as Drops} from '#/components/icons/Drop'
import {Grid_Stroke2_Corner0_Rounded as Grid} from '#/components/icons/Grid'
import {HomeOpen_Stoke2_Corner0_Rounded as Social} from '#/components/icons/HomeOpen'
import {Image_Stroke2_Corner0_Rounded as Images} from '#/components/icons/Image'
import {Message_Stroke2_Corner0_Rounded as Streams} from '#/components/icons/Message'
import {Newspaper_Stroke2_Corner2_Rounded as Editorial} from '#/components/icons/Newspaper'
import {VideoClip_Stroke2_Corner0_Rounded as Video} from '#/components/icons/VideoClip'

const icons = {
  social: Social,
  streams: Streams,
  drops: Drops,
  video: Video,
  images: Images,
  editorial: Editorial,
}

const labels = {
  social: 'Social',
  streams: 'Streams',
  drops: 'Drops',
  video: 'Video',
  images: 'Pics',
  editorial: 'Editorial',
}

export function FeedViewSwitcher({
  placement = 'page',
}: {
  placement?: 'page' | 'header' | 'compose' | 'icon'
}) {
  const mode = useFeedExperience()
  const setMode = useSetFeedExperience()
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const CurrentIcon = icons[mode]

  useEffect(() => {
    if (!open) return
    root.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return (
    <div
      ref={root}
      className={
        placement === 'compose'
          ? 'feed-view-switcher feed-view-switcher--compose'
          : placement === 'icon'
            ? 'feed-view-switcher feed-view-switcher--icon'
            : placement === 'header'
              ? 'feed-view-switcher feed-view-switcher--header'
              : 'feed-view-switcher'
      }
      data-theme={theme.name}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setOpen(false)
          trigger.current?.focus()
        }
        if (!open) return
        const buttons = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitemradio"]',
          ) ?? [],
        )
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        )
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? 1
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
            ? -1
            : 0
        if (direction || event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          buttons[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + direction + buttons.length) % buttons.length
          ]?.focus()
        }
      }}>
      <button
        ref={trigger}
        type="button"
        className="feed-view-trigger"
        aria-label={`Change feed view: ${labels[mode]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(value => !value)}>
        {placement === 'icon' ? (
          <Grid width={22} fill="currentColor" aria-hidden />
        ) : placement === 'compose' ? (
          <DotGrid width={24} fill="currentColor" aria-hidden />
        ) : (
          <>
            <CurrentIcon width={18} fill="currentColor" aria-hidden />
            <Chevron width={14} fill="currentColor" aria-hidden />
          </>
        )}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label="Feed view"
          className={
            placement !== 'page'
              ? 'feed-view-menu feed-view-menu--end'
              : 'feed-view-menu'
          }>
          {FEED_EXPERIENCE_MODES.map(value => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-label={labels[value]}
              aria-checked={mode === value}
              tabIndex={mode === value ? 0 : -1}
              title={labels[value]}
              onClick={() => {
                setMode(value)
                setOpen(false)
                trigger.current?.focus()
              }}>
              {(() => {
                const Icon = icons[value]
                return <Icon width={20} fill="currentColor" aria-hidden />
              })()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
