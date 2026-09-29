import React, {Suspense} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {useFonts} from 'expo-font'

import {atoms as a, useTheme} from '#/alf'

/**
 * Web entry of the AQUA DOCS block editor. Loads the Trueno editor font and
 * lazy-loads the heavy BlockNote/Yjs bundle so it stays out of the main web
 * chunk.
 */
const BlockNoteInner = React.lazy(
  () => import('#/components/docs/BlockNoteInner.web'),
)

export function BlockEditor({docId}: {docId: string}) {
  const t = useTheme()
  const [fontsLoaded] = useFonts({
    Trueno: require('../../../assets/fonts/trueno/truenorg.otf'),
    'Trueno-Italic': require('../../../assets/fonts/trueno/truenorgit.otf'),
    'Trueno-Light': require('../../../assets/fonts/trueno/truenolt.otf'),
    'Trueno-SemiBold': require('../../../assets/fonts/trueno/truenosbd.otf'),
    'Trueno-Bold': require('../../../assets/fonts/trueno/truenobd.otf'),
    'Trueno-BoldItalic': require('../../../assets/fonts/trueno/truenobdit.otf'),
  })

  if (!fontsLoaded) {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center]}>
        <ActivityIndicator color={t.palette.primary_500} />
      </View>
    )
  }

  return (
    <Suspense
      fallback={
        <View style={[a.flex_1, a.align_center, a.justify_center]}>
          <ActivityIndicator color={t.palette.primary_500} />
        </View>
      }>
      <BlockNoteInner docId={docId} />
    </Suspense>
  )
}
