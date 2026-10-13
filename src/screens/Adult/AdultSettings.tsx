import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {useAdultContext} from '#/state/adult/context'
import {PortalScreen} from '#/screens/Adult/portal/PortalScreen'
import {SettingsView} from '#/screens/Adult/portal/SettingsView'

/** /adult/settings — content, display, privacy and reports. */
export function AdultSettingsScreen() {
  const navigation = useNavigation<NavigationProp>()
  const ctx = useAdultContext()
  return (
    <PortalScreen testID="adultSettingsScreen">
      <SettingsView
        onLeave={() => {
          ctx.exit()
          navigation.navigate('Home')
        }}
      />
    </PortalScreen>
  )
}
