import {useMemo} from 'react'
import {View} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {channelPath} from '#/lib/view-channel/model'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {useSuggestedFollowsQuery} from '#/state/queries/suggested-follows'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Empty, LibraryPage} from './shared'

function ChannelCard({profile}: {profile: AppBskyActorDefs.ProfileView}) {
  const t = useTheme()
  return (
    <Link
      to={channelPath(profile.handle)}
      label={`Abrir canal de ${profile.handle}`}
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.p_md,
        a.rounded_lg,
        a.border,
        t.atoms.border_contrast_low,
        {width: 300, maxWidth: '100%'},
      ]}>
      <UserAvatar size={48} avatar={profile.avatar} type="user" />
      <View style={[a.flex_1, {minWidth: 0}]}>
        <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
          {sanitizeDisplayName(
            profile.displayName || sanitizeHandle(profile.handle),
          )}
        </Text>
        <Text
          style={[a.text_sm, t.atoms.text_contrast_medium]}
          numberOfLines={1}>
          {sanitizeHandle(profile.handle, '@')}
        </Text>
      </View>
    </Link>
  )
}

function Grid({children}: {children: React.ReactNode}) {
  return <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>{children}</View>
}

export function ViewChannelsScreen() {
  const t = useTheme()
  const {currentAccount} = useSession()
  const follows = useProfileFollowsQuery(currentAccount?.did, {limit: 50})
  const suggested = useSuggestedFollowsQuery({limit: 12})
  const mine = useMemo(
    () => follows.data?.pages.flatMap(p => p.follows) ?? [],
    [follows.data],
  )
  const mineDids = useMemo(() => new Set(mine.map(p => p.did)), [mine])
  const rest = useMemo(
    () =>
      (suggested.data?.pages.flatMap(p => p.actors) ?? [])
        .filter(p => !mineDids.has(p.did) && p.did !== currentAccount?.did)
        .slice(0, 12),
    [suggested.data, mineDids, currentAccount],
  )

  return (
    <LibraryPage
      testID="viewChannelsScreen"
      title="Canais"
      subtitle="Quem você segue e canais novos para descobrir."
      actions={
        <Link to="/views/channel/new" label="Criar meu canal">
          <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
            Criar meu canal
          </Text>
        </Link>
      }>
      <Text style={[a.text_xl, a.font_bold]}>Seus canais</Text>
      {follows.isLoading ? (
        <Text style={[t.atoms.text_contrast_medium]}>Carregando…</Text>
      ) : !mine.length ? (
        <Empty
          title="Você ainda não segue ninguém"
          body="Siga perfis para ver os canais deles aqui."
        />
      ) : (
        <>
          <Grid>
            {mine.map(p => (
              <ChannelCard key={p.did} profile={p} />
            ))}
          </Grid>
          {follows.hasNextPage && (
            <View style={[a.flex_row]}>
              <Button
                label="Carregar mais canais"
                size="small"
                color="secondary"
                disabled={follows.isFetchingNextPage}
                onPress={() => follows.fetchNextPage()}>
                <ButtonText>Carregar mais</ButtonText>
              </Button>
            </View>
          )}
        </>
      )}
      {rest.length > 0 && (
        <>
          <Text style={[a.text_xl, a.font_bold, a.pt_md]}>
            Sugeridos para você
          </Text>
          <Grid>
            {rest.map(p => (
              <ChannelCard key={p.did} profile={p} />
            ))}
          </Grid>
        </>
      )}
    </LibraryPage>
  )
}
