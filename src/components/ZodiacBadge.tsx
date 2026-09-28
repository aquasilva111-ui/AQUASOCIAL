import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {getZodiacSign, type ZodiacSign} from '#/lib/zodiac'
import {useZodiacQuery} from '#/state/queries/zodiac'
import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Verified-style badge showing the profile owner's chosen zodiac sign
 * glyph, styled like the verification checkmark badge. Renders nothing
 * if the profile hasn't set one (see Edit Profile).
 */
export function ZodiacBadge({
  did,
  size = 'lg',
}: {
  did: string
  size?: 'lg' | 'md' | 'sm'
}) {
  const {data: sign} = useZodiacQuery(did)
  if (!sign) return null
  return <ZodiacBadgeInner sign={sign} size={size} />
}

export function ZodiacBadgeInner({
  sign,
  size = 'lg',
}: {
  sign: ZodiacSign
  size?: 'lg' | 'md' | 'sm'
}) {
  const {_} = useLingui()
  const info = getZodiacSign(sign)
  if (!info) return null
  const dimensions = size === 'lg' ? 20 : size === 'md' ? 16 : 13

  return (
    <View
      accessibilityLabel={_(msg`Signo: ${info.label}`)}
      accessibilityHint=""
      style={[
        a.justify_center,
        a.align_center,
        a.rounded_full,
        {
          width: dimensions,
          height: dimensions,
          backgroundColor: '#5B4CFF',
        },
      ]}>
      <Text
        style={[
          {
            color: '#fff',
            fontSize: dimensions * 0.62,
            lineHeight: dimensions,
          },
        ]}>
        {info.symbol}
      </Text>
    </View>
  )
}
