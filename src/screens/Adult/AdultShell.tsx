import {useCallback} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useAdultContext} from '#/state/adult/context'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowBoxLeft_Stroke2_Corner0_Rounded as LeaveIcon} from '#/components/icons/ArrowBoxLeft'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {AdultGate} from './AdultGate'

/** Subtle permanent marker that the user is inside the adult context. */
const CONTEXT_ACCENT = '#d6336c'

/**
 * Visual/logical container of the AQUA +18 environment. Same AQUA chrome,
 * plus a context banner with the explicit exit. Exiting tears down the
 * adult context before navigating away, and nothing +18 renders outside
 * the gate — so leaving unmounts any adult media and sensitive previews.
 */
export function AdultShell({
  title,
  testID,
  children,
}: {
  title: string
  testID: string
  children: React.ReactNode
}) {
  const t = useTheme()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const ctx = useAdultContext()

  const exitAdult = useCallback(() => {
    ctx.exit()
    navigation.navigate('Home')
  }, [ctx, navigation])

  return (
    <Layout.Screen testID={testID}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_md,
          a.py_sm,
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <View
            style={[
              a.rounded_full,
              {width: 10, height: 10, backgroundColor: CONTEXT_ACCENT},
            ]}
          />
          <Text style={[a.text_sm, a.font_semi_bold, {color: CONTEXT_ACCENT}]}>
            {_(msg`Ambiente +18`)}
          </Text>
        </View>
        <Button
          label={_(msg`Sair do +18`)}
          size="small"
          variant="ghost"
          color="secondary"
          onPress={exitAdult}>
          <ButtonIcon icon={LeaveIcon} />
          <ButtonText>{_(msg`Sair do +18`)}</ButtonText>
        </Button>
      </View>
      <AdultGate ctx={ctx}>{children}</AdultGate>
    </Layout.Screen>
  )
}
