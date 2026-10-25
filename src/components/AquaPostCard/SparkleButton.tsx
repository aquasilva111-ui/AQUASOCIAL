import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {EventStopper} from '#/view/com/util/EventStopper'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {Sparkle_Stroke2_Corner0_Rounded as Sparkle} from '#/components/icons/Sparkle'
import {aquaGlass} from './glass'
import {AQUA} from './palette'

export function SparkleButton({onPress}: {onPress: () => void}) {
  const {_} = useLingui()
  const t = useTheme()
  const light = t.name === 'light'
  return (
    <EventStopper onKeyDown={false}>
      <Button
        label={_(msg`Why am I seeing this?`)}
        onPress={onPress}
        hitSlop={8}
        style={[
          a.align_center,
          a.justify_center,
          a.rounded_full,
          aquaGlass(light),
          {width: 34, height: 34},
        ]}
        hoverStyle={{
          backgroundColor: light
            ? 'rgba(255,255,255,0.8)'
            : 'rgba(15,23,42,0.85)',
        }}>
        <Sparkle width={15} height={15} style={{color: AQUA.primary}} />
      </Button>
    </EventStopper>
  )
}
