import {useState} from 'react'
import {ScrollView, TextInput, View} from 'react-native'
import {useInfiniteQuery, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  adultApi,
  type AdultNetworkAuthor,
  type AdultNetworkPost,
  syncAdultBlock,
  syncAdultRelation,
} from '#/lib/adult/api'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {
  AdultNetworkPostCard,
  authorName,
  networkKey,
} from '#/components/adult/AdultNetwork'
import {AdultReportButton} from '#/components/adult/AdultReportButton'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'
import {AdultApiNotice} from './AdultViews'

type Profile = AdultNetworkAuthor & {
  bio: string | null
  counts: {posts: number; followers: number; following: number}
  viewer: {
    following: boolean
    muted: boolean
    blocked: boolean
    self: boolean
  }
}

/** /adult/user/:did — a +18 profile: counts, follow/mute/block and posts. */
export function AdultUserScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultUser'>) {
  const {did: target} = route.params
  const agent = useAgent()
  const t = useTheme()
  const qc = useQueryClient()
  const me = agent.session?.did
  const key = networkKey('profile', target, me)
  const profile = useQuery({
    queryKey: key,
    queryFn: () =>
      adultApi<Profile>(agent, `/adult/users/${encodeURIComponent(target)}`),
  })
  const posts = useInfiniteQuery({
    queryKey: networkKey('userPosts', target, me),
    initialPageParam: undefined as string | undefined,
    queryFn: ({pageParam}) =>
      adultApi<{posts: AdultNetworkPost[]; next: string | null}>(
        agent,
        `/adult/users/${encodeURIComponent(target)}/posts${
          pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: last => last.next ?? undefined,
    enabled: !!profile.data && !profile.data.viewer.blocked,
  })
  const refresh = () => qc.invalidateQueries({queryKey: key})

  const p = profile.data
  const [bio, setBio] = useState('')
  const [displayName, setDisplayName] = useState('')

  const saveProfile = async () => {
    await adultApi(agent, '/me/adult/profile', {
      method: 'PUT',
      body: {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      },
    })
    await refresh()
  }

  return (
    <AdultShell title="Perfil +18" testID="adultUserScreen">
      <ScrollView contentContainerStyle={{paddingBottom: 120}}>
        {profile.error ? (
          <AdultApiNotice
            error={profile.error}
            onRetry={() => profile.refetch()}
          />
        ) : !p ? (
          <Text style={[a.p_lg]}>Carregando…</Text>
        ) : (
          <>
            <View
              style={[
                a.p_md,
                a.gap_sm,
                a.border_b,
                t.atoms.border_contrast_low,
                {maxWidth: 680, width: '100%', alignSelf: 'center'},
              ]}>
              <Text style={[a.text_xl, a.font_bold]}>{authorName(p)}</Text>
              {p.handle && (
                <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                  {`@${p.handle}`}
                </Text>
              )}
              {!!p.bio && <Text style={[a.text_md]}>{p.bio}</Text>}
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {`${p.counts.posts} posts · ${p.counts.followers} seguidores · ${p.counts.following} seguindo`}
              </Text>
              {p.viewer.self ? (
                <View style={[a.gap_sm]}>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Nome de exibição"
                    placeholderTextColor="#8a8a90"
                    maxLength={60}
                    accessibilityLabel="Nome de exibição"
                    accessibilityHint="Como seu nome aparece no +18"
                    style={[
                      a.p_md,
                      a.rounded_md,
                      a.text_md,
                      t.atoms.bg_contrast_25,
                      t.atoms.text,
                    ]}
                  />
                  <TextInput
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Bio"
                    placeholderTextColor="#8a8a90"
                    maxLength={500}
                    multiline
                    accessibilityLabel="Bio"
                    accessibilityHint="Uma frase sobre você"
                    style={[
                      a.p_md,
                      a.rounded_md,
                      a.text_md,
                      t.atoms.bg_contrast_25,
                      t.atoms.text,
                      {minHeight: 60, textAlignVertical: 'top'},
                    ]}
                  />
                  <Button
                    label="Salvar perfil"
                    size="small"
                    color="primary"
                    disabled={!displayName.trim() && !bio.trim()}
                    onPress={saveProfile}>
                    <ButtonText>Salvar perfil</ButtonText>
                  </Button>
                </View>
              ) : (
                <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
                  <Button
                    label={p.viewer.following ? 'Seguindo' : 'Seguir'}
                    size="small"
                    variant={p.viewer.following ? 'ghost' : 'solid'}
                    color={p.viewer.following ? 'secondary' : 'primary'}
                    onPress={() =>
                      syncAdultRelation(
                        agent,
                        'follows',
                        target,
                        !p.viewer.following,
                      )
                        .then(refresh)
                        .catch(() => {})
                    }>
                    <ButtonText>
                      {p.viewer.following ? 'Seguindo' : 'Seguir'}
                    </ButtonText>
                  </Button>
                  <Button
                    label={p.viewer.muted ? 'Reativar' : 'Silenciar'}
                    size="small"
                    variant="ghost"
                    color="secondary"
                    onPress={() =>
                      syncAdultRelation(agent, 'mutes', target, !p.viewer.muted)
                        .then(refresh)
                        .catch(() => {})
                    }>
                    <ButtonText>
                      {p.viewer.muted ? 'Reativar' : 'Silenciar'}
                    </ButtonText>
                  </Button>
                  <Button
                    label={p.viewer.blocked ? 'Desbloquear' : 'Bloquear'}
                    size="small"
                    variant="ghost"
                    color="secondary"
                    onPress={() =>
                      syncAdultBlock(agent, target, !p.viewer.blocked)
                        .then(refresh)
                        .catch(() => {})
                    }>
                    <ButtonText>
                      {p.viewer.blocked ? 'Desbloquear' : 'Bloquear'}
                    </ButtonText>
                  </Button>
                  <AdultReportButton targetType="user" resourceId={target} />
                </View>
              )}
            </View>
            {p.viewer.blocked ? (
              <Text style={[a.p_lg, t.atoms.text_contrast_medium]}>
                Você bloqueou esta pessoa.
              </Text>
            ) : posts.data?.pages.some(g => g.posts.length) ? (
              <>
                {posts.data.pages
                  .flatMap(g => g.posts)
                  .map(post => (
                    <AdultNetworkPostCard key={post.id} post={post} />
                  ))}
                {posts.hasNextPage && (
                  <View style={[a.align_center, a.py_md]}>
                    <Button
                      label="Carregar mais"
                      size="small"
                      onPress={() => posts.fetchNextPage()}>
                      <ButtonText>Carregar mais</ButtonText>
                    </Button>
                  </View>
                )}
              </>
            ) : (
              <Text
                style={[a.p_lg, a.text_center, t.atoms.text_contrast_medium]}>
                Nenhum post ainda.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </AdultShell>
  )
}
