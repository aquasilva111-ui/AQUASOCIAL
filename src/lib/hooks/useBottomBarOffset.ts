import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {clamp} from '#/lib/numbers'

export function useBottomBarOffset(modifier: number = 0) {
  const {bottom: bottomInset} = useSafeAreaInsets()
  // Floating dock (~72) + inset (~12) so content is never covered.
  return clamp(96 + bottomInset, 96, 120) + modifier
}