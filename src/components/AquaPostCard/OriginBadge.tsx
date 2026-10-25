import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {type PostOrigin} from './model'
import {AQUA} from './palette'

export function OriginBadge({origin}: {origin: PostOrigin}) {
  const t = useTheme()
  const {_} = useLingui()
  const light = t.name === 'light'
  const fromBluesky = origin === 'bluesky'
  const label = fromBluesky ? _(msg`From Bluesky`) : _(msg`Aqua`)

  return (
    <View
      accessibilityRole="text"
      style={[
        a.ml_xs,
        a.rounded_full,
        a.px_xs,
        a.py_2xs,
        {
          backgroundColor: fromBluesky
            ? light
              ? AQUA.white
              : 'transparent'
            : AQUA.requestedBg,
          borderWidth: fromBluesky ? 1 : 0,
          borderColor: light
            ? AQUA.line
            : t.atoms.border_contrast_low.borderColor,
        },
      ]}>
      <Text
        style={[
          a.font_bold,
          a.leading_tight,
          {
            fontSize: 11,
            color: fromBluesky
              ? light
                ? AQUA.muted
                : t.atoms.text_contrast_medium.color
              : AQUA.primary,
          },
        ]}>
        {label}
      </Text>
    </View>
  )
}
