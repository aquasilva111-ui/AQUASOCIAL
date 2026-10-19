import {isWeb} from '#/platform/detection'
import {ViewsChrome} from '#/screens/Media/ViewsChrome'
import * as Layout from '#/components/Layout'

/**
 * Aqua Views chrome for channel/studio pages: the Views sidebar on web
 * (same as the Views home), a regular header on native.
 */
export function ViewShell({
  title,
  testID,
  children,
}: {
  title: string
  testID: string
  children: React.ReactNode
}) {
  if (isWeb) {
    return (
      <Layout.Screen testID={testID} hideCenterBorders>
        <ViewsChrome>{children}</ViewsChrome>
      </Layout.Screen>
    )
  }
  return (
    <Layout.Screen testID={testID}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>{children}</Layout.Content>
    </Layout.Screen>
  )
}
