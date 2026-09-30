import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

function ComingSoon({title, testID}: {title: string; testID: string}) {
  const t = useTheme()
  return (
    <Layout.Screen testID={testID}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 96}]}>
          <Text style={[a.text_3xl, a.font_bold, a.text_center]}>{title}</Text>
          <Text
            style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
            Em desenvolvimento
          </Text>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

export function UIAIScreen() {
  return <ComingSoon title="UI & AI" testID="uiAiScreen" />
}
