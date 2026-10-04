import {useMemo, useState} from 'react'
import {useSyncExternalStore} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {useIsFocused} from '@react-navigation/native'

import {syncAdultBlock, syncAdultRelation} from '#/lib/adult/api'
import {toAdultPosts} from '#/lib/adult/content'
import {toAdultCreatorProfile} from '#/lib/adult/creator'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {useAdultContext} from '#/state/adult/context'
import {
  blockAdultCreator,
  followAdultCreator,
  getAdultRelationshipsSnapshot,
  isAdultFollowing,
  isCreatorBlocked,
  subscribeAdultRelationships,
  unblockAdultCreator,
  unfollowAdultCreator,
} from '#/state/adult/relationships'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {type FeedDescriptor, usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileQuery} from '#/state/queries/profile'
import {useAgent} from '#/state/session'
import {List} from '#/view/com/util/List'
import {atoms as a, useTheme} from '#/alf'
import {AdultPostCard} from '#/components/adult/AdultPostCard'
import {AdultReportButton} from '#/components/adult/AdultReportButton'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'
import {AdultShell} from './AdultShell'

type CreatorTab = 'posts' | 'media'

/**
 * /adult/creator/:name — the +18 creator page. Creator = role over the AQUA
 * Identity; the profile data comes from the existing profile query. Follow
 * and block here are adult-private relationships (never public AT records).
 * Subscribe is a FASE 8 surface — visible, honest, not yet transactional.
 */
export function AdultCreatorScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'AdultCreator'>) {
  return (
    <AdultShell title="Creator" testID="adultCreatorScreen">
      <AdultCreatorInner handle={route.params.name} />
    </AdultShell>
  )
}

function AdultCreatorInner({handle}: {handle: string}) {
  const t = useTheme()
  const focused = useIsFocused()
  const ctx = useAdultContext()
  const agent = useAgent()
  const moderationOpts = useModerationOpts()
  const [tab, setTab] = useState<CreatorTab>('posts')
  useSyncExternalStore(
    subscribeAdultRelationships,
    getAdultRelationshipsSnapshot,
  )

  const profile = useProfileQuery({did: handle})
  const creator = profile.data ? toAdultCreatorProfile(profile.data) : null

  const descriptor: FeedDescriptor | null = creator
    ? `author|${creator.userId}|${
        tab === 'media' ? 'posts_with_media' : 'posts_no_replies'
      }`
    : null
  const feed = usePostFeedQuery(descriptor ?? 'following', undefined, {
    enabled: focused && ctx.adultAccessEnabled && !!descriptor,
  })

  const did = ctx.identity?.did
  const posts = useMemo(() => {
    if (!moderationOpts || !did || !descriptor) return []
    const candidates =
      feed.data?.pages.flatMap(page =>
        page.slices.flatMap(slice => slice.items),
      ) ?? []
    return toAdultPosts(candidates)
  }, [moderationOpts, did, descriptor, feed.data])

  if (profile.isLoading) {
    return (
      <View style={[a.align_center, {paddingTop: 96}]}>
        <Text
          style={[a.text_md, t.atoms.text_contrast_medium]}
          accessibilityRole="progressbar">
          Carregando...
        </Text>
      </View>
    )
  }
  if (!creator) {
    return (
      <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 96}]}>
        <Text style={[a.text_lg, a.font_bold]}>Creator não encontrado</Text>
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>@{handle}</Text>
      </View>
    )
  }

  const following = did ? isAdultFollowing(did, creator.userId) : false
  const blocked = did ? isCreatorBlocked(did, creator.userId) : false
  const isSelf = did === creator.userId

  const header = (
    <View>
      {!!creator.banner && (
        <Image
          accessibilityIgnoresInvertColors
          source={{uri: creator.banner}}
          style={[a.w_full, {height: 120}]}
          contentFit="cover"
          accessibilityLabel="Banner do creator"
          accessibilityHint="Imagem de capa do perfil do creator"
        />
      )}
      <View style={[a.p_md, a.gap_sm]}>
        <Text style={[a.text_xl, a.font_bold]} numberOfLines={1}>
          {creator.displayName || `@${creator.handle}`}
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          @{creator.handle}
          {creator.verificationStatus === 'verified' ? ' · ✓' : ''}
        </Text>
        {!!creator.bio && <Text style={[a.text_md]}>{creator.bio}</Text>}
        {typeof creator.followersCount === 'number' && (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {creator.followersCount} seguidores
          </Text>
        )}
        {!isSelf && did && (
          <View style={[a.flex_row, a.gap_sm, a.pt_xs, a.flex_wrap]}>
            <Button
              label={following ? 'Seguindo' : 'Seguir'}
              size="small"
              variant={following ? 'ghost' : 'solid'}
              color="secondary"
              onPress={() => {
                if (following) unfollowAdultCreator(did, creator.userId)
                else followAdultCreator(did, creator.userId)
                // Durable server copy; the local state already updated.
                syncAdultRelation(
                  agent,
                  'follows',
                  creator.userId,
                  !following,
                ).catch(() => {})
              }}>
              <ButtonText>{following ? 'Seguindo' : 'Seguir'}</ButtonText>
            </Button>
            <Button
              label="Assinar"
              size="small"
              variant="solid"
              color="primary"
              disabled
              onPress={() => {}}>
              <ButtonText>Assinar - em breve</ButtonText>
            </Button>
            <Button
              label={blocked ? 'Desbloquear' : 'Bloquear'}
              size="small"
              variant="ghost"
              color="secondary"
              onPress={() => {
                if (blocked) unblockAdultCreator(did, creator.userId)
                else blockAdultCreator(did, creator.userId)
                // Server-side block (feeds, recommendations, live chat).
                syncAdultBlock(agent, creator.userId, !blocked).catch(() => {})
              }}>
              <ButtonText>{blocked ? 'Desbloquear' : 'Bloquear'}</ButtonText>
            </Button>
          </View>
        )}
        {!isSelf && did && (
          <AdultReportButton targetType="user" resourceId={creator.userId} />
        )}
        <View style={[a.flex_row, a.gap_xs, a.pt_sm]}>
          <Button
            label="Posts"
            size="small"
            variant={tab === 'posts' ? 'solid' : 'ghost'}
            color="secondary"
            onPress={() => setTab('posts')}>
            <ButtonText>Posts</ButtonText>
          </Button>
          <Button
            label="Mídia"
            size="small"
            variant={tab === 'media' ? 'solid' : 'ghost'}
            color="secondary"
            onPress={() => setTab('media')}>
            <ButtonText>Mídia</ButtonText>
          </Button>
        </View>
      </View>
    </View>
  )

  return (
    <List
      data={posts}
      keyExtractor={post => post.id}
      renderItem={({item}) => <AdultPostCard post={item} />}
      ListHeaderComponent={header}
      onEndReached={
        feed.hasNextPage && !feed.isFetching
          ? () => feed.fetchNextPage()
          : undefined
      }
      onEndReachedThreshold={2}
      contentContainerStyle={{paddingBottom: 120}}
      ListEmptyComponent={
        !feed.isFetching ? (
          <View style={[a.align_center, a.px_xl, {paddingTop: 48}]}>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              Nenhuma publicação +18 deste creator ainda.
            </Text>
          </View>
        ) : null
      }
    />
  )
}
