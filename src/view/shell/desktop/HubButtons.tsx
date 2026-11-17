import {type ReactNode} from 'react'
import {View} from 'react-native'

import {atoms as a, useLayoutBreakpoints, web} from '#/alf'
import {
  CREATIVE_ORANGE,
  LAUNCH_BLUE,
  LaunchMark,
} from '#/components/icons/LaunchMark'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {LEFT_NAV_MINIMAL_WIDTH, SIDEBAR_OPEN_WIDTH} from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/** Round buttons in the minimal (icon-only) nav. */
const ROUND_SIZE = 48
/** Pill height in the full nav; both pills share a row, so they're compact. */
const PILL_HEIGHT = 44
/** Heavier than a.font_bold (700) — the variable Inter font renders it on web. */
const PILL_LABEL_WEIGHT = '800' as const

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
const HUB = '#FF442A'
const EYE = '#7EC8F5'
const PILL_WIDTH = SIDEBAR_OPEN_WIDTH - 28

function LaunchEye() {
  return (
    <View
      style={[
        a.align_center,
        a.justify_center,
        {width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff'},
      ]}>
      <View
        style={[
          {width: 12, height: 12, borderRadius: 6, backgroundColor: '#000'},
          web({boxShadow: `0 0 0 3px ${EYE}`}),
        ]}
      />
    </View>
  )
}

/**
 * Desktop hover rail: 44px circles anchored on the icon axis. Opening grows
 * each one into a pill without moving the glyph.
 */
function RailButtons({
  open,
  reduceMotion,
  holdNavigation,
  onFirstPress,
}: {
  open: boolean
  reduceMotion: boolean
  holdNavigation: boolean
  onFirstPress: () => void
}) {
  const motion = web({
    transitionProperty: reduceMotion ? 'none' : 'width, box-shadow',
    transitionDuration: reduceMotion ? '0ms' : '200ms',
    transitionTimingFunction: 'ease-out',
  })
  const labelMotion = web({
    opacity: open ? 1 : 0,
    transform: open ? 'translateX(0px)' : 'translateX(-6px)',
    whiteSpace: 'nowrap',
    transitionProperty: reduceMotion ? 'none' : 'opacity, transform',
    transitionDuration: reduceMotion ? '0ms' : '160ms, 200ms',
    transitionDelay: reduceMotion || !open ? '0ms' : '20ms, 0ms',
    transitionTimingFunction: 'ease-out',
  })

  const button = (
    to: string,
    title: string,
    backgroundColor: string,
    shadow: string,
    glyph: ReactNode,
    text: string,
  ) => (
    <Link
      to={to}
      label={title}
      onPress={
        holdNavigation
          ? () => {
              onFirstPress()
              return false
            }
          : undefined
      }
      style={[
        a.flex_row,
        a.align_center,
        a.overflow_hidden,
        a.rounded_full,
        {
          marginLeft: 14,
          height: 44,
          width: open ? PILL_WIDTH : 44,
          backgroundColor,
        },
        web({boxShadow: shadow}),
        motion,
      ]}>
      <View style={[a.align_center, a.justify_center, {width: 44, height: 44}]}>
        {glyph}
      </View>
      <Text
        style={[{color: '#fff', fontSize: 14, fontWeight: '800'}, labelMotion]}>
        {text}
      </Text>
    </Link>
  )

  return (
    <View style={{gap: 10, paddingTop: 4}}>
      {button(
        '/creative-hub',
        'Creative Hub',
        HUB,
        '0 6px 18px rgba(255,68,42,.35)',
        <PlusIcon size="md" fill="#fff" />,
        'Creative Hub',
      )}
      {button(
        '/launch',
        'Launch',
        LAUNCH_BLUE,
        '0 6px 18px rgba(0,43,239,.35)',
        <LaunchEye />,
        'Launch',
      )}
    </View>
  )
}

export function HubButtons({
  minimal,
  flush,
  rail,
  open,
  reduceMotion,
  holdNavigation,
  onFirstPress,
}: {
  minimal?: boolean
  flush?: boolean
  rail?: boolean
  open?: boolean
  reduceMotion?: boolean
  holdNavigation?: boolean
  onFirstPress?: () => void
} = {}) {
  const {leftNavMinimal} = useLayoutBreakpoints()
  const iconOnly = minimal ?? leftNavMinimal

  if (rail) {
    return (
      <RailButtons
        open={!!open}
        reduceMotion={!!reduceMotion}
        holdNavigation={!!holdNavigation}
        onFirstPress={onFirstPress ?? (() => {})}
      />
    )
  }

  if (iconOnly) {
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
        flush
          ? {
              gap: 6,
              paddingLeft: (LEFT_NAV_MINIMAL_WIDTH - 40) / 2,
              paddingRight: 12,
            }
          : {gap: 6, marginRight: -20},
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
            <PlusIcon size="sm" fill="#fff" />
            <Text
              style={[
                a.text_md,
                {color: '#fff', fontWeight: PILL_LABEL_WEIGHT},
              ]}>
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
            <Text
              style={[
                a.text_md,
                {color: '#fff', fontWeight: PILL_LABEL_WEIGHT},
              ]}>
              Launch
            </Text>
          </View>
        )}
      </Link>
    </View>
  )
}
