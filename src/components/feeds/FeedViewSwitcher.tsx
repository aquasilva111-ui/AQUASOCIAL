import {View} from 'react-native'

import {
  FEED_EXPERIENCE_MODES,
  useFeedExperience,
  useSetFeedExperience,
} from '#/state/shell/feed-experience'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {ChevronBottom_Stroke2_Corner0_Rounded as Chevron} from '#/components/icons/Chevron'
import {HomeOpen_Stoke2_Corner0_Rounded as Social} from '#/components/icons/HomeOpen'
import {Image_Stroke2_Corner0_Rounded as Images} from '#/components/icons/Image'
import {Message_Stroke2_Corner0_Rounded as Streams} from '#/components/icons/Message'
import {Newspaper_Stroke2_Corner2_Rounded as Editorial} from '#/components/icons/Newspaper'
import {Play_Filled_Corner0_Rounded as Drops} from '#/components/icons/Play'
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

/**
 * Native feed view switcher: a compact row of mode icons shown in the home
 * header. Web has a richer dropdown version in FeedViewSwitcher.web.tsx.
 */
export function FeedViewSwitcher() {
  const mode = useFeedExperience()
  const setMode = useSetFeedExperience()
  const t = useTheme()

  return (
    <View style={[a.flex_row, a.justify_center, {paddingVertical: 8}]}>
      <Menu.Root>
        <Menu.Trigger label={`Feed view: ${mode}`}>
          {({props}) => (
            <Button
              {...props}
              label={props.accessibilityLabel}
              variant="ghost"
              color="secondary"
              style={[
                a.border,
                a.rounded_sm,
                t.atoms.border_contrast_low,
                a.px_sm,
                a.gap_xs,
                {height: 30},
              ]}>
              <ButtonText>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </ButtonText>
              <Chevron width={14} fill={t.atoms.text.color} />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          {FEED_EXPERIENCE_MODES.map(value => {
            const Icon = experienceIcons[value]
            const active = value === mode
            return (
              <Menu.Item
                key={value}
                label={`Feed view: ${value}`}
                onPress={() => setMode(value)}>
                <Menu.ItemIcon icon={Icon} />
                <Menu.ItemText style={active ? a.font_bold : undefined}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </Menu.ItemText>
              </Menu.Item>
            )
          })}
        </Menu.Outer>
      </Menu.Root>
    </View>
  )
}
