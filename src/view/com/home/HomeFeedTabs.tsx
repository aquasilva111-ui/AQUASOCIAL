import {Pressable, View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {isWeb} from '#/platform/detection'
import {
  atoms as a,
  useBreakpoints,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {FeedViewSwitcher} from '#/components/feeds/FeedViewSwitcher'
import {Hashtag_Stroke2_Corner0_Rounded as FeedsIcon} from '#/components/icons/Hashtag'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/** AQUA blue, from the logo (lighter in dark mode for contrast). */
const ACTIVE_COLOR = '#002bef'
const ACTIVE_COLOR_DARK = '#3e5bff'
const SIDE_SLOT = 44

/**
 * Home tabs: just Following and For You, centered. Every other pinned feed
 * lives in the Feeds dialog behind the "+".
 */
export function HomeFeedTabs({
  testID,
  items,
  selectedPage,
  onSelect,
  onPressSelected,
  onPressAdd,
}: {
  testID?: string
  items: string[]
  selectedPage: number
  onSelect?: (index: number) => void
  onPressSelected?: () => void
  onPressAdd: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  const {gtMobile} = useBreakpoints()
  const {rightNavVisible} = useLayoutBreakpoints()
  // Wide web: the grid and # buttons sit here, next to +, instead of in a row
  // of their own above the tabs.
  const withActions = isWeb && gtMobile && rightNavVisible

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[a.w_full, a.flex_row, a.align_center, t.atoms.bg]}>
      <View style={{width: SIDE_SLOT}} />
      <View style={[a.flex_1, a.flex_row, a.justify_center, a.gap_2xl]}>
        {items.map((item, index) => {
          const selected = index === selectedPage
          return (
            <Pressable
              key={`${item}-${index}`}
              testID={testID ? `${testID}-selector-${index}` : undefined}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              accessibilityLabel={item}
              accessibilityHint=""
              onPress={() => {
                onSelect?.(index)
                if (selected) onPressSelected?.()
              }}
              style={[a.py_md, a.px_xs]}>
              <Text
                emoji
                style={[
                  {fontSize: 13},
                  a.font_bold,
                  selected
                    ? {
                        color:
                          t.name === 'light' ? ACTIVE_COLOR : ACTIVE_COLOR_DARK,
                      }
                    : t.atoms.text_contrast_medium,
                  web({transition: 'color 150ms ease'}),
                ]}>
                {item}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {withActions && <View style={{width: SIDE_SLOT}} />}
      <View
        style={
          withActions
            ? [
                a.flex_row,
                a.align_center,
                a.gap_xs,
                a.justify_end,
                {width: SIDE_SLOT},
                // The cluster is wider than the slot; let it grow leftwards
                // so the tabs stay centered (the spacer above balances it).
                web({position: 'absolute', right: 0, width: 'auto'}),
              ]
            : [a.align_center, {width: SIDE_SLOT}]
        }>
        {withActions && (
          <>
            <FeedViewSwitcher placement="icon" />
            <Link
              to="/feeds"
              hitSlop={10}
              label={_(msg`View your feeds and explore more`)}
              size="small"
              variant="ghost"
              color="secondary"
              shape="square"
              style={[a.justify_center]}>
              <ButtonIcon icon={FeedsIcon} size="lg" />
            </Link>
          </>
        )}
        <Button
          label="Feeds"
          size="small"
          shape="round"
          variant="ghost"
          color="secondary"
          onPress={onPressAdd}>
          <ButtonIcon icon={PlusIcon} size="lg" />
        </Button>
      </View>
    </View>
  )
}
