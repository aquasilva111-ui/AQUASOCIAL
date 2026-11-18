import {View} from 'react-native'

import {LoggedOutLayout} from '#/view/com/util/layouts/LoggedOutLayout'
import {FormContainer} from '#/screens/Login/FormContainer'
import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'

export function IdentityShell({
  testID,
  leadin,
  title,
  description,
  children,
}: {
  testID: string
  leadin: string
  title: string
  description: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Layout.Screen testID={testID} style={[a.flex_1, t.atoms.bg]}>
      <LoggedOutLayout
        leadin={leadin}
        title={title}
        description={description}
        scrollable>
        <FormContainer testID={`${testID}Form`} titleText={title}>
          <View style={[a.gap_md, a.pb_xl]}>{children}</View>
        </FormContainer>
      </LoggedOutLayout>
    </Layout.Screen>
  )
}

export function HintText({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
      {children}
    </Text>
  )
}
