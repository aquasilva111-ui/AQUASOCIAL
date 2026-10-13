import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {HomeView} from '#/screens/Adult/portal/HomeView'
import {PortalScreen} from '#/screens/Adult/portal/PortalScreen'

/** /adult — Para você. Gated. Seed catalog until the portal API is reachable. */
export function AdultHomeScreen() {
  const navigation = useNavigation<NavigationProp>()
  return (
    <PortalScreen testID="adultHomeScreen">
      <HomeView onOpenWeb={() => navigation.navigate('AdultWeb')} />
    </PortalScreen>
  )
}
