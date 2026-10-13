import {PortalScreen} from '#/screens/Adult/portal/PortalScreen'
import {WebView} from '#/screens/Adult/portal/WebView'

/** /adult/web — curated external index. No crawler. */
export function AdultWebScreen() {
  return (
    <PortalScreen testID="adultWebScreen">
      <WebView />
    </PortalScreen>
  )
}
