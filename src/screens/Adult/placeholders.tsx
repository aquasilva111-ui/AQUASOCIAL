import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

/**
 * Structural placeholder for +18 sub-areas. Lives inside the AdultShell, so
 * even placeholder screens are behind the gate (no deep-link bypass).
 */
function AdultPlaceholder({title, testID}: {title: string; testID: string}) {
  const t = useTheme()
  return (
    <AdultShell title={title} testID={testID}>
      <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 96}]}>
        <Text style={[a.text_2xl, a.font_bold, a.text_center]}>{title}</Text>
        <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
          Em desenvolvimento
        </Text>
      </View>
    </AdultShell>
  )
}

export function AdultMessagesScreen() {
  return <AdultPlaceholder title="Mensagens +18" testID="adultMessagesScreen" />
}

export function AdultSettingsScreen() {
  return (
    <AdultPlaceholder title="Configurações +18" testID="adultSettingsScreen" />
  )
}
