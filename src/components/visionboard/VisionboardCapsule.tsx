import {type ReactNode} from 'react'
import {Pressable, View} from 'react-native'

import {atoms as a, useTheme, web} from '#/alf'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export type CapsuleVariant = 'glass' | 'ink' | 'blue'

/**
 * The Visionboard capsule family: translucent glass for actions, solid ink
 * (black, white in dark mode) for analytics, blue for the creator's name.
 */
export function useCapsuleStyle(variant: CapsuleVariant) {
  const t = useTheme()
  const dark = t.scheme === 'dark'
  if (variant === 'ink') {
    return {
      backgroundColor: dark ? '#F2F3F4' : '#111315',
      color: dark ? '#111315' : '#FFFFFF',
      borderColor: 'transparent',
      extra: web({boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)'}),
    }
  }
  if (variant === 'blue') {
    return {
      backgroundColor: '#0057FF',
      color: '#FFFFFF',
      borderColor: 'transparent',
      extra: web({boxShadow: '0 6px 18px rgba(0, 87, 255, 0.35)'}),
    }
  }
  return {
    backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)',
    color: dark ? '#ECEDEE' : '#111315',
    borderColor: dark ? 'rgba(255,255,255,0.16)' : 'rgba(20,40,110,0.12)',
    extra: web({
      backdropFilter: 'blur(18px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.8)',
      boxShadow: dark
        ? '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 4px 16px rgba(0,43,239,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
    }),
  }
}

export function Capsule({
  label,
  variant = 'glass',
  onPress,
  to,
  icon: Icon,
  active,
  tint,
  text,
  children,
  compact,
}: {
  label: string
  variant?: CapsuleVariant
  onPress?: () => void
  to?: string
  icon?: React.ComponentType<SVGIconProps>
  active?: boolean
  /** Overrides the text/icon colour (e.g. a red heart once liked). */
  tint?: string
  /** Plain label; use `children` only for custom content. */
  text?: string | number
  children?: ReactNode
  compact?: boolean
}) {
  const s = useCapsuleStyle(variant)
  const color = tint ?? s.color
  const content = (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.rounded_full,
        {
          paddingHorizontal: compact ? 18 : 22,
          paddingVertical: compact ? 9 : 11,
          backgroundColor: s.backgroundColor,
          borderWidth: 1,
          borderColor: s.borderColor,
        },
        s.extra,
      ]}>
      {Icon && <Icon width={16} fill={color} style={{opacity: 0.9}} />}
      {text !== undefined && (
        <Text style={[a.text_md, {color, fontWeight: active ? '700' : '600'}]}>
          {text}
        </Text>
      )}
      {children}
    </View>
  )
  if (to) {
    return (
      <Link to={to} label={label}>
        {content}
      </Link>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      onPress={onPress}
      disabled={!onPress}>
      {content}
    </Pressable>
  )
}

/** Analytics capsule: icon, bold number, soft label. */
export function StatCapsule({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<SVGIconProps>
  value: string
  label: string
}) {
  const s = useCapsuleStyle('ink')
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      accessibilityHint=""
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.rounded_full,
        {
          paddingHorizontal: 18,
          paddingVertical: 9,
          backgroundColor: s.backgroundColor,
        },
        s.extra,
      ]}>
      <Icon width={15} fill={s.color} style={{opacity: 0.7}} />
      <Text style={[a.text_md, {color: s.color, fontWeight: '700'}]}>
        {value}
      </Text>
      <Text style={[a.text_sm, {color: s.color, opacity: 0.6}]}>{label}</Text>
    </View>
  )
}
