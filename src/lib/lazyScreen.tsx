import React from 'react'
import {View} from 'react-native'

import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'

function RouteFallback() {
  return (
    <View style={[a.flex_1, a.align_center, a.justify_center, a.p_xl]}>
      <Text style={[a.text_md]} accessibilityRole="progressbar">
        Carregando…
      </Text>
    </View>
  )
}

/** Route-level split: the screen module loads on navigation, not with the shell. */
export function lazyNamed(
  loader: () => Promise<Record<string, unknown>>,
  name: string,
): React.ComponentType<any> {
  const Lazy = React.lazy(() =>
    loader().then(mod => {
      const component = mod[name]
      if (typeof component !== 'function') {
        throw new Error(`Tela ausente: ${name}`)
      }
      return {default: component as React.ComponentType<any>}
    }),
  )
  function LazyRoute(props: Record<string, unknown>) {
    return (
      <React.Suspense fallback={<RouteFallback />}>
        <Lazy {...props} />
      </React.Suspense>
    )
  }
  LazyRoute.displayName = `Lazy(${name})`
  return LazyRoute
}
