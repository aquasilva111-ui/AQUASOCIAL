import {useEffect} from 'react'
import {StackActions, useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {type CommonNavigatorParams} from '#/lib/routes/types'

/** `/videos` became `/views`; keep old links working. */
export function LegacyVideosRedirect() {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.dispatch(StackActions.replace('Videos'))
  }, [navigation])
  return null
}

/** `/videos/watch/…` became `/views/watch/…` (keeps `?t=`). */
export function LegacyVideoWatchRedirect({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'VideoWatchLegacy'>) {
  const navigation = useNavigation()
  const {name, rkey, t} = route.params
  useEffect(() => {
    navigation.dispatch(
      StackActions.replace('VideoWatch', t ? {name, rkey, t} : {name, rkey}),
    )
  }, [navigation, name, rkey, t])
  return null
}

/** `/videos/channel/…` became `/views/channel/…`. */
export function LegacyViewChannelRedirect({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ViewChannelLegacy'>) {
  const navigation = useNavigation()
  const {handle} = route.params
  useEffect(() => {
    navigation.dispatch(StackActions.replace('ViewChannel', {handle}))
  }, [navigation, handle])
  return null
}
