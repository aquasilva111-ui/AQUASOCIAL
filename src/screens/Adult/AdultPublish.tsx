import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {PortalScreen} from '#/screens/Adult/portal/PortalScreen'
import {PublishView} from '#/screens/Adult/portal/PublishView'

/** /adult/publish — four-step publish with consent and the hash stub. */
export function AdultPublishScreen() {
  const navigation = useNavigation<NavigationProp>()
  return (
    <PortalScreen testID="adultPublishScreen">
      <PublishView onDone={() => navigation.navigate('AdultHome')} />
    </PortalScreen>
  )
}
