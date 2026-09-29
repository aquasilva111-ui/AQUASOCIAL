import {View} from 'react-native'

import {atoms as a, useLayoutBreakpoints, web} from '#/alf'
import {
  CREATIVE_ORANGE,
  LAUNCH_BLUE,
  LaunchMark,
} from '#/components/icons/LaunchMark'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/** Round buttons in the minimal (icon-only) nav. */
const ROUND_SIZE = 48
/** Pill height in the full nav; both pills share a row, so they're compact. */
const PILL_HEIGHT = 40

const lift = (active: boolean) =>
  web({
    transition: 'transform 180ms ease',
    transform: active ? 'translateY(-1px) scale(1.03)' : undefined,
  })

const glow = (color: string) => web({boxShadow: `0 6px 18px ${color}40`})

/**
 * Left nav entry points: Creative Hub (build) and Launch Hub (distribute).
 * New Post stays in the floating dock.
 */
export function HubButtons() {
  const {leftNavMinimal} = useLayoutBreakpoints()

  if (leftNavMinimal) {
    return (
      <View style={[a.align_center, a.gap_sm, a.pt_md]}>
        <Link
          to="/creative-hub"
          label="Creative Hub"
          style={[
            a.rounded_full,
            a.align_center,
            a.justify_center,
            {
              width: ROUND_SIZE,
              height: ROUND_SIZE,
              backgroundColor: CREATIVE_ORANGE,
            },
            glow(CREATIVE_ORANGE),
          ]}>
          {({hovered, pressed}) => (
            <View style={lift(hovered || pressed)}>
              <PlusIcon size="sm" fill="#fff" />
            </View>
          )}
        </Link>
        <Link
          to="/launch"
          label="Launch"
          style={[
            a.rounded_full,
            {width: ROUND_SIZE, height: ROUND_SIZE},
            glow(LAUNCH_BLUE),
          ]}>
          {({hovered, pressed}) => (
            <View style={lift(hovered || pressed)}>
              <LaunchMark size={ROUND_SIZE} />
            </View>
          )}
        </Link>
      </View>
    )
  }

  return (
    <View
      style={[
        a.flex_row,
        a.flex_wrap,
        a.align_center,
        a.pt_xl,
        // use the nav's right padding so both pills share one row
        {gap: 6, marginRight: -20},
      ]}>
      <Link
        to="/creative-hub"
        label="Creative Hub"
        style={[
          a.rounded_full,
          a.px_md,
          {height: PILL_HEIGHT, backgroundColor: CREATIVE_ORANGE},
          glow(CREATIVE_ORANGE),
        ]}>
        {({hovered, pressed}) => (
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.gap_xs,
              lift(hovered || pressed),
            ]}>
            <PlusIcon size="xs" fill="#fff" />
            <Text style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
              Creative Hub
            </Text>
          </View>
        )}
      </Link>
      {/* Mirrors the Launch artwork: the lens fills the pill's left end. */}
      <Link
        to="/launch"
        label="Launch"
        style={[
          a.rounded_full,
          {
            height: PILL_HEIGHT,
            paddingRight: 14,
            backgroundColor: LAUNCH_BLUE,
          },
          glow(LAUNCH_BLUE),
        ]}>
        {({hovered, pressed}) => (
          <View
            style={[
              a.flex_row,
              a.align_center,
              {gap: 6},
              lift(hovered || pressed),
            ]}>
            <LaunchMark size={PILL_HEIGHT} />
            <Text style={[a.text_sm, a.font_bold, {color: '#fff'}]}>
              Launch
            </Text>
          </View>
        )}
      </Link>
    </View>
  )
}
