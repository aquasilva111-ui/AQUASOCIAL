import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

/**
 * Structural placeholder for +18 sub-areas. Lives inside the AdultShell, so
 * even placeholder screens are behind the gate (no deep-link bypass).
 */
function AdultPlaceholder({title, testID}: {title: string; testID: string}) {
  const t = useTheme()
  const {_} = useLingui()
  return (
    <AdultShell title={title} testID={testID}>
      <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 96}]}>
        <Text style={[a.text_2xl, a.font_bold, a.text_center]}>{title}</Text>
        <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
          {_(msg`Em desenvolvimento`)}
        </Text>
      </View>
    </AdultShell>
  )
}

export function AdultViewsScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder title={_(msg`Views +18`)} testID="adultViewsScreen" />
  )
}

export function AdultLiveScreen() {
  const {_} = useLingui()
  return <AdultPlaceholder title={_(msg`Live +18`)} testID="adultLiveScreen" />
}

export function AdultStudiosScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder title={_(msg`Studios +18`)} testID="adultStudiosScreen" />
  )
}

export function AdultLibraryScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder
      title={_(msg`Minha biblioteca`)}
      testID="adultLibraryScreen"
    />
  )
}

export function AdultMessagesScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder
      title={_(msg`Mensagens +18`)}
      testID="adultMessagesScreen"
    />
  )
}

export function AdultSettingsScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder
      title={_(msg`Configurações +18`)}
      testID="adultSettingsScreen"
    />
  )
}

export function AdultCreatorDashboardScreen() {
  const {_} = useLingui()
  return (
    <AdultPlaceholder
      title={_(msg`Creator Dashboard`)}
      testID="adultCreatorDashboardScreen"
    />
  )
}
