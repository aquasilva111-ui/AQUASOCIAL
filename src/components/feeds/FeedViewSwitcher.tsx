import {View} from 'react-native'

import {
  FEED_EXPERIENCE_MODES,
  useFeedExperience,
  useSetFeedExperience,
} from '#/state/shell/feed-experience'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {ChevronBottom_Stroke2_Corner0_Rounded as Chevron} from '#/components/icons/Chevron'
import {Drop_Filled_Corner0_Rounded as Drops} from '#/components/icons/Drop'
import {HomeOpen_Stoke2_Corner0_Rounded as Social} from '#/components/icons/HomeOpen'
import {Image_Stroke2_Corner0_Rounded as Images} from '#/components/icons/Image'
import {Message_Stroke2_Corner0_Rounded as Streams} from '#/components/icons/Message'
import {Newspaper_Stroke2_Corner2_Rounded as Editorial} from '#/components/icons/Newspaper'
import {VideoClip_Stroke2_Corner0_Rounded as Video} from '#/components/icons/VideoClip'
import * as Menu from '#/components/Menu'

export const experienceIcons = {
  social: Social,
  streams: Streams,
  drops: Drops,
  video: Video,
  images: Images,
  editorial: Editorial,
} as const

const experienceLabels = {
  social: 'Social',
  streams: 'Streams',
  drops: 'Drops',
  video: 'Video',
  images: 'Pics',
  editorial: 'Editorial',
} as const

/**
 * Native feed view switcher: a compact row of mode icons shown in the home
 * header. Web has a richer dropdown version in FeedViewSwitcher.web.tsx.
 * `placement` is web-only (header row vs below the tab bar) and ignored here.
 */
export function FeedViewSwitcher(_props: {
  placement?: 'page' | 'header' | 'compose' | 'icon'
}) {
  const mode = useFeedExperience()
  const setMode = useSetFeedExperience()
  const t = useTheme()
  const CurrentIcon = experienceIcons[mode]

  return (
    <View style={[a.flex_row, a.justify_center, {paddingVertical: 8}]}>
      <Menu.Root>
        <Menu.Trigger label={`Feed view: ${experienceLabels[mode]}`}>
          {({props}) => (
            <Button
              {...props}
              label={props.accessibilityLabel}
              variant="ghost"
              color="secondary"
              style={[
                a.border,
                a.rounded_full,
                t.atoms.border_contrast_low,
                a.px_sm,
                a.gap_xs,
                {height: 30},
              ]}>
              <CurrentIcon width={18} fill={t.atoms.text.color} />
              <Chevron width={14} fill={t.atoms.text.color} />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          {FEED_EXPERIENCE_MODES.map(value => {
            const Icon = experienceIcons[value]
            return (
              <Menu.Item
                key={value}
                label={`Feed view: ${experienceLabels[value]}`}
                onPress={() => setMode(value)}>
                <Menu.ItemIcon icon={Icon} />
              </Menu.Item>
            )
          })}
        </Menu.Outer>
      </Menu.Root>
    </View>
  )
}
