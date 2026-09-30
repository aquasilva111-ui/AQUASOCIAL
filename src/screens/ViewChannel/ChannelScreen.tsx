import {View} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {makeProfileLink} from '#/lib/routes/links'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {shareUrl} from '#/lib/sharing'
import {toShareUrl} from '#/lib/strings/url-helpers'
import {channelAccess, channelPath} from '#/lib/view-channel/model'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {
  ReportDialog,
  useReportDialogControl,
} from '#/components/moderation/ReportDialog'
import {Text} from '#/components/Typography'
import {ChannelView} from '#/components/view-channel/ChannelView'
import {useChannelData} from './useChannelData'
import {ViewShell} from './ViewShell'

export function ViewChannelScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ViewChannel'>) {
  return (
    <ViewShell title="Canal" testID="viewChannelScreen">
      <ChannelPage handle={route.params.handle} />
    </ViewShell>
  )
}

function Notice({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={[a.align_center, a.gap_md, a.px_xl, {paddingTop: 96}]}>
      <Text style={[a.text_2xl, a.font_bold, a.text_center]}>{title}</Text>
      {body && (
        <Text
          style={[
            a.text_md,
            a.text_center,
            t.atoms.text_contrast_medium,
            {maxWidth: 440},
          ]}>
          {body}
        </Text>
      )}
      {children}
    </View>
  )
}

function ChannelPage({handle}: {handle: string}) {
  const t = useTheme()
  const data = useChannelData(handle)
  const {profile, channel, isOwner} = data

  if (profile.isLoading || data.channelQuery.isLoading)
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>Carregando…</Text>
    )
  if (!profile.data)
    return (
      <Notice
        title="Canal não encontrado"
        body={`Não existe um perfil AQUA com o handle @${handle}.`}
      />
    )
  if (data.channelQuery.isError)
    return (
      <Notice title="Não foi possível carregar o canal">
        <Button
          label="Tentar novamente"
          size="small"
          color="secondary"
          onPress={() => data.channelQuery.refetch()}>
          <ButtonText>Tentar novamente</ButtonText>
        </Button>
      </Notice>
    )

  const access = channelAccess({
    channel,
    isOwner,
    moderated: data.moderated,
  })
  if (access.state === 'suspended')
    return (
      <Notice
        title="Canal indisponível"
        body="Este canal está indisponível por decisão de moderação do AQUA."
      />
    )
  if (access.state === 'unavailable')
    return <Notice title="Este canal não está disponível" />
  if (access.state === 'none' || !channel)
    return isOwner ? (
      <Notice
        title="Você ainda não tem um canal no View"
        body="Seu canal usa o seu perfil AQUA: mesmo avatar, mesmo handle e seus seguidores como inscritos. Nada de conta nova.">
        <Link to="/views/channel/new" label="Criar canal">
          <View
            style={[
              a.rounded_full,
              a.px_lg,
              a.py_sm,
              {backgroundColor: '#0b5cff'},
            ]}>
            <Text style={[a.text_md, a.font_bold, {color: '#fff'}]}>
              Criar canal
            </Text>
          </View>
        </Link>
      </Notice>
    ) : (
      <Notice title={`@${profile.data.handle} ainda não tem um canal no View`}>
        <Link
          to={makeProfileLink(profile.data)}
          label={`Ver perfil de @${profile.data.handle}`}>
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Ver perfil →
          </Text>
        </Link>
      </Notice>
    )

  return (
    <View>
      {isOwner && access.status === 'draft' && (
        <View style={[a.px_lg, a.py_sm, {backgroundColor: '#fff4d6'}]}>
          <Text style={[a.text_sm, {color: '#5c4400'}]}>
            Rascunho: só você vê este canal. Publique em Personalizar canal →
            Informações básicas.
          </Text>
        </View>
      )}
      {isOwner && channel.visibility === 'private' && (
        <View style={[a.px_lg, a.py_sm, t.atoms.bg_contrast_25]}>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Canal privado: fica oculto para outras pessoas no AQUA.
          </Text>
        </View>
      )}
      <ChannelView
        profile={profile.data}
        channel={channel}
        bannerUri={data.bannerUrl}
        watermarkUri={data.watermarkUrl}
        videos={data.videos}
        drops={data.drops}
        hasMoreVideos={!!data.feed.hasNextPage}
        onLoadMoreVideos={() => data.feed.fetchNextPage()}
        live={data.live}
        trailer={data.trailer}
        featured={data.featured}
        isOwner={isOwner}
        actions={
          isOwner ? <OwnerActions /> : <VisitorActions profile={profile.data} />
        }
      />
    </View>
  )
}

function ActionLink({to, label}: {to: string; label: string}) {
  const t = useTheme()
  return (
    <Link to={to} label={label}>
      <View
        style={[
          a.rounded_full,
          a.px_md,
          a.py_xs,
          a.border,
          t.atoms.border_contrast_medium,
        ]}>
        <Text style={[a.text_sm, a.font_bold]}>{label}</Text>
      </View>
    </Link>
  )
}

/** Owner-only controls. Visitors never get them (and the PDS rejects writes). */
function OwnerActions() {
  const {openComposer} = useOpenComposer()
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.pt_sm]}>
      <ActionLink to="/views/studio/customization" label="Personalizar canal" />
      <Button
        label="Enviar vídeo"
        size="small"
        color="secondary"
        onPress={() => openComposer({})}>
        <ButtonText>Enviar vídeo</ButtonText>
      </Button>
      <ActionLink to="/views/golive" label="Transmitir ao vivo" />
      <ActionLink to="/views/studio" label="View Studio" />
    </View>
  )
}

function VisitorActions({
  profile,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
}) {
  const {hasSession} = useSession()
  const shadow = useProfileShadow(profile)
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    shadow,
    'ProfileHeader',
  )
  const reportControl = useReportDialogControl()
  const subscribed = !!shadow.viewer?.following
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.pt_sm]}>
      {hasSession && (
        <Button
          label={subscribed ? 'Inscrito' : 'Inscrever-se'}
          size="small"
          variant="solid"
          color={subscribed ? 'secondary' : 'primary'}
          onPress={() => (subscribed ? queueUnfollow() : queueFollow())}>
          <ButtonText>{subscribed ? 'Inscrito' : 'Inscrever-se'}</ButtonText>
        </Button>
      )}
      <Button
        label="Compartilhar canal"
        size="small"
        color="secondary"
        onPress={() => shareUrl(toShareUrl(channelPath(profile.handle)))}>
        <ButtonText>Compartilhar</ButtonText>
      </Button>
      {hasSession && (
        <>
          <Button
            label="Denunciar canal"
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => reportControl.open()}>
            <ButtonText>Denunciar</ButtonText>
          </Button>
          <ReportDialog
            control={reportControl}
            subject={{
              ...profile,
              $type: 'app.bsky.actor.defs#profileViewDetailed',
            }}
          />
        </>
      )}
    </View>
  )
}
