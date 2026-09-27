import {View} from 'react-native'
import {Linking} from 'react-native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {liveWatchUrl} from '#/lib/streamplace'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useProfileQuery} from '#/state/queries/profile'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {LiveEmbed} from '#/components/feeds/LiveEmbed'
import {ArrowOutOfBox_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import * as Layout from '#/components/Layout'
import {InlineLinkText} from '#/components/Link'
import {Text} from '#/components/Typography'

export function VideoLiveScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'VideoLive'>) {
  const {name} = route.params
  const t = useTheme()
  const {data: profile} = useProfileQuery({did: name})

  return (
    <Layout.Screen testID="aqua-video-live" hideCenterBorders>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Aqua Live</Layout.Header.TitleText>
        </Layout.Header.Content>
      </Layout.Header.Outer>
      <Layout.Center style={{maxWidth: 1100}}>
        <View style={[a.p_md, a.gap_md]}>
          <LiveEmbed name={name} />
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            {profile && <PreviewableUserAvatar size={40} profile={profile} />}
            <View style={[a.flex_1, {minWidth: 0}]}>
              <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
                {profile
                  ? sanitizeDisplayName(
                      profile.displayName || sanitizeHandle(profile.handle),
                    )
                  : sanitizeHandle(name, '@')}
              </Text>
              {profile && (
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  {sanitizeHandle(profile.handle, '@')}
                </Text>
              )}
            </View>
            <Button
              label="Abrir no Streamplace"
              size="small"
              variant="solid"
              color="primary"
              onPress={() => {
                Linking.openURL(liveWatchUrl(profile?.handle ?? name))
              }}>
              <ButtonText>Abrir no Streamplace</ButtonText>
              <ButtonIcon icon={ShareIcon} position="right" />
            </Button>
          </View>
          <Text style={[a.text_sm, t.atoms.text_contrast_low]}>
            Transmitido via infraestrutura Streamplace ·{' '}
            <InlineLinkText
              to={liveWatchUrl(profile?.handle ?? name)}
              label="Assistir no Streamplace">
              assistir no nó de vídeo
            </InlineLinkText>
          </Text>
        </View>
      </Layout.Center>
    </Layout.Screen>
  )
}
