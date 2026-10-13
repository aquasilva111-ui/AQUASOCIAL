import {View} from 'react-native'

import {useAdultContext} from '#/state/adult/context'
import {AdultGate} from '#/screens/Adult/AdultGate'
import * as Layout from '#/components/Layout'

/** Full-bleed +18 page. The gate replaces the screen until the viewer opts in. */
export function PortalScreen({
  testID,
  children,
}: {
  testID: string
  children: React.ReactNode
}) {
  const ctx = useAdultContext()
  return (
    <Layout.Screen
      testID={testID}
      hideCenterBorders
      noInsetTop
      style={{flex: 1, backgroundColor: '#fff'}}>
      <AdultGate ctx={ctx}>
        <View style={{flex: 1, backgroundColor: '#fff', minHeight: '100%'}}>
          {children}
        </View>
      </AdultGate>
    </Layout.Screen>
  )
}
