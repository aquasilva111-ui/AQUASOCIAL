import {useEffect} from 'react'
import {StackActions, useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'

/** `/images` became `/visionboard`; keep old links working. */
export function LegacyImagesRedirect() {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.dispatch(StackActions.replace('Images'))
  }, [navigation])
  return null
}

/** `/images/view/…` became `/visionboard/view/…`. */
export function LegacyImageDetailRedirect({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ImageDetailLegacy'>) {
  const navigation = useNavigation()
  const {name, rkey} = route.params
  useEffect(() => {
    navigation.dispatch(StackActions.replace('ImageDetail', {name, rkey}))
  }, [navigation, name, rkey])
  return null
}
