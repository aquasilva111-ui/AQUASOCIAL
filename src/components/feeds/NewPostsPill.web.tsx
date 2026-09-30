import './new-posts-pill.css'

import {type AppBskyActorDefs} from '@atproto/api'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {useGate} from '#/lib/statsig/statsig'
import {useTheme} from '#/alf'
import {ArrowTop_Stroke2_Corner0_Rounded as ArrowIcon} from '#/components/icons/Arrow'

/**
 * X-style "new posts" pill: an animated glass capsule shown at the top of the
 * feed when fresh posts arrive. Tapping it scrolls up and loads the latest.
 */
export function NewPostsPill({
  authors,
  onPress,
  label,
  text,
}: {
  authors: AppBskyActorDefs.ProfileViewBasic[]
  onPress: () => void
  label: string
  /** Overrides the default "posted" text (used when there are no avatars). */
  text?: string
}) {
  const theme = useTheme()
  const {_} = useLingui()
  const gate = useGate()
  const postedLabel = text ?? _(msg`posted`)
  if (gate('remove_show_latest_button')) {
    return null
  }

  return (
    <button
      type="button"
      className="new-posts-pill"
      data-theme={theme.name}
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
