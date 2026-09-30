import {View} from 'react-native'

import {atoms as a} from '#/alf'
import {DocsList} from '#/components/docs/DocsList'
import * as Layout from '#/components/Layout'

/** AQUA DOCS entry point: list of the account's documents on this device. */
export function DocsHomeScreen() {
  return (
    <Layout.Screen testID="docsHomeScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>AQUA DOCS</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>

      <View style={[a.p_md, a.gap_md, a.flex_1]}>
        <DocsList />
      </View>
    </Layout.Screen>
  )
}
