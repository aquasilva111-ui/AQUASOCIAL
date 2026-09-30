import {useEffect, useMemo, useState} from 'react'
import {View} from 'react-native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {LIMITS} from '#/lib/view-channel/model'
import {
  channelBlobUrl,
  useSaveViewChannelMutation,
} from '#/state/queries/view-channel'
import {useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  BannerEditor,
  ChannelPreview,
  Chip,
  type Draft,
  Field,
  FieldLabelText,
  HandleReadOnly,
  HintText,
  InheritedIdentity,
  LanguagePicker,
  LinksEditor,
  type LocalImages,
  SectionsEditor,
  TopicsField,
  VideoPicker,
  VisibilityPicker,
  WatermarkEditor,
} from './editor'
import {useChannelData} from './useChannelData'
import {ViewShell} from './ViewShell'

export function ViewStudioScreen() {
  return (
    <ViewShell title="View Studio" testID="viewStudioScreen">
      <Studio section="overview" />
    </ViewShell>
  )
}

export function ViewStudioCustomizeScreen() {
  return (
    <ViewShell title="Personalizar canal" testID="viewStudioCustomizeScreen">
      <Studio section="customization" />
    </ViewShell>
  )
}

function StudioNav({section}: {section: 'overview' | 'customization'}) {
  const t = useTheme()
  const item = (to: string, label: string, active: boolean) => (
    <Link to={to} label={label}>
      <View
        style={[
          a.px_md,
          a.py_xs,
          a.rounded_full,
          active ? {backgroundColor: '#0b5cff'} : t.atoms.bg_contrast_25,
        ]}>
        <Text style={[a.text_sm, a.font_bold, active && {color: '#fff'}]}>
          {label}
        </Text>
      </View>
    </Link>
  )
  return (
    <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
      {item('/views/studio', 'Painel', section === 'overview')}
      {item(
        '/views/studio/customization',
        'Personalização',
        section === 'customization',
      )}
    </View>
  )
}

/** Only ever the signed-in account's own channel: no channel id is taken from the URL. */
function Studio({section}: {section: 'overview' | 'customization'}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const data = useChannelData(currentAccount?.did)
  const profile = data.profile.data

  if (!profile || data.channelQuery.isLoading)
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>Carregando…</Text>
    )
  return (
    <View style={[a.p_lg, a.gap_lg]}>
      <View style={[a.gap_sm]}>
        <Text style={[a.text_3xl, a.font_bold]}>View Studio</Text>
        <StudioNav section={section} />
      </View>
      {!data.channel ? (
        <View style={[a.gap_md, a.p_lg, a.rounded_md, t.atoms.bg_contrast_25]}>
          <Text style={[a.text_lg, a.font_bold]}>
            Você ainda não tem um canal no View
          </Text>
          <Link to="/views/channel/new" label="Criar canal">
            <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
              Criar canal →
            </Text>
          </Link>
        </View>
      ) : section === 'overview' ? (
        <Overview data={data} />
      ) : (
        <Customization data={data} />
      )}
    </View>
  )
}

type Data = ReturnType<typeof useChannelData>

function Overview({data}: {data: Data}) {
  const t = useTheme()
  const {openComposer} = useOpenComposer()
  const profile = data.profile.data!
  const channel = data.channel!
  const stat = (label: string, value: string | number) => (
    <View
      style={[
        a.p_md,
        a.rounded_md,
        a.gap_xs,
        t.atoms.bg_contrast_25,
        {flexGrow: 1, flexBasis: 160},
      ]}>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>{label}</Text>
      <Text style={[a.text_xl, a.font_bold]}>{value}</Text>
    </View>
  )
  return (
    <View style={[a.gap_lg]}>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        {stat('Inscritos', profile.followersCount ?? 0)}
        {stat(
          'Vídeos',
          `${data.videos.length}${data.feed.hasNextPage ? '+' : ''}`,
        )}
        {stat('Drops', data.drops.length)}
        {stat(
          'Status',
          channel.status === 'draft'
            ? 'Rascunho'
            : channel.visibility === 'private'
              ? 'Privado'
              : 'Público',
        )}
      </View>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        <Link to={`/views/channel/${profile.handle}`} label="Ver canal">
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Ver canal →
          </Text>
        </Link>
        <Link to="/views/studio/customization" label="Personalizar canal">
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Personalizar →
          </Text>
        </Link>
        <Link to="/views/golive" label="Transmitir ao vivo">
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Transmitir ao vivo →
          </Text>
        </Link>
      </View>
      <View style={[a.flex_row]}>
        <Button
          label="Enviar vídeo"
          size="small"
          color="primary"
          onPress={() => openComposer({})}>
          <ButtonText>Enviar vídeo</ButtonText>
        </Button>
      </View>
      <HintText>
        Análises por vídeo, retenção e moderação de comentários ainda não fazem
        parte do View Studio.
      </HintText>
    </View>
  )
}

type Tab = 'layout' | 'branding' | 'basic'

function Customization({data}: {data: Data}) {
  const t = useTheme()
  const {gtTablet} = useBreakpoints()
  const profile = data.profile.data!
  const published = data.channel!
  const save = useSaveViewChannelMutation()
  const [tab, setTab] = useState<Tab>('layout')
  const [draft, setDraftState] = useState<Draft>(published)
  const [local, setLocal] = useState<LocalImages>({})
  const [message, setMessage] = useState<string>()
  const setDraft = (fn: (d: Draft) => Draft) => {
    setMessage(undefined)
    setDraftState(fn)
  }

  // A newer published version (e.g. saved in another tab) resets a clean draft.
  const publishedKey = JSON.stringify(published)
  const [base, setBase] = useState(publishedKey)
  useEffect(() => {
    if (publishedKey !== base && JSON.stringify(draft) === base) {
      setDraftState(published)
      setBase(publishedKey)
    }
  }, [publishedKey, base, draft, published])

  const dirty = JSON.stringify(draft) !== base
  const did = data.did!
  const blobUrl = (kind: 'banner' | 'watermark') =>
    draft[kind]
      ? (local[kind] ?? channelBlobUrl(data.pdsUrl, did, draft[kind]))
      : undefined
  const bannerUri = blobUrl('banner')
  const watermarkUri = blobUrl('watermark')
  const allVideos = useMemo(
    () => [...data.videos, ...data.drops],
    [data.videos, data.drops],
  )

  const publish = async () => {
    setMessage(undefined)
    try {
      const saved = await save.mutateAsync(draft)
      setBase(JSON.stringify(saved))
      setDraftState(saved)
      setMessage('Alterações publicadas.')
    } catch {
      setMessage('Não foi possível publicar. Nada foi alterado no canal.')
    }
  }

  const editor = (
    <View style={[a.gap_lg, gtTablet ? {width: 440} : a.w_full]}>
      <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
        <Chip
          label="Layout"
          selected={tab === 'layout'}
          onPress={() => setTab('layout')}
        />
        <Chip
          label="Visual"
          selected={tab === 'branding'}
          onPress={() => setTab('branding')}
        />
        <Chip
          label="Informações básicas"
          selected={tab === 'basic'}
          onPress={() => setTab('basic')}
        />
      </View>

      {tab === 'layout' && (
        <>
          <VideoPicker
            label="Trailer do canal"
            hint="Mostrado para quem ainda não é inscrito."
            videos={allVideos}
            value={draft.trailerUri}
            onChange={uri => setDraft(d => ({...d, trailerUri: uri}))}
          />
          <VideoPicker
            label="Vídeo em destaque"
            hint="Mostrado para inscritos (e para todos, se não houver trailer)."
            videos={allVideos}
            value={draft.featuredUri}
            onChange={uri => setDraft(d => ({...d, featuredUri: uri}))}
          />
          <SectionsEditor draft={draft} setDraft={setDraft} />
        </>
      )}

      {tab === 'branding' && (
        <>
          <BannerEditor
            draft={draft}
            setDraft={setDraft}
            bannerUri={bannerUri}
            setLocal={setLocal}
          />
          <View style={[a.gap_xs]}>
            <FieldLabelText>Avatar</FieldLabelText>
            <InheritedIdentity profile={profile} />
          </View>
          <WatermarkEditor
            draft={draft}
            setDraft={setDraft}
            watermarkUri={watermarkUri}
            setLocal={setLocal}
          />
        </>
      )}

      {tab === 'basic' && (
        <>
          <Field
            label="Nome do canal"
            value={draft.displayNameOverride ?? ''}
            onChange={v =>
              setDraft(d => ({...d, displayNameOverride: v || undefined}))
            }
            placeholder={profile.displayName || profile.handle}
            maxLength={LIMITS.displayName}
            hint="Vazio = usa o nome do seu perfil AQUA."
          />
          <HandleReadOnly handle={profile.handle} />
          <Field
            label="Descrição"
            value={draft.description ?? ''}
            onChange={v => setDraft(d => ({...d, description: v || undefined}))}
            multiline
            maxLength={LIMITS.description}
          />
          <LinksEditor draft={draft} setDraft={setDraft} />
          <LanguagePicker draft={draft} setDraft={setDraft} />
          <TopicsField draft={draft} setDraft={setDraft} />
          <View style={[a.gap_xs]}>
            <Field
              label="Contato público"
              value={draft.contact ?? ''}
              onChange={v => setDraft(d => ({...d, contact: v || undefined}))}
              placeholder="ex.: contato@seudominio.com"
              maxLength={LIMITS.contact}
            />
            <View style={[a.flex_row, a.gap_xs]}>
              <Chip
                label="Mostrar no Sobre"
                selected={!!draft.contactVisible}
                onPress={() => setDraft(d => ({...d, contactVisible: true}))}
              />
              <Chip
                label="Não mostrar"
                selected={!draft.contactVisible}
                onPress={() => setDraft(d => ({...d, contactVisible: false}))}
              />
            </View>
            <HintText>
              Só preencha um contato que você quer tornar público: ele fica no
              seu repositório AT.
            </HintText>
          </View>
          <VisibilityPicker draft={draft} setDraft={setDraft} />
          <View style={[a.gap_xs]}>
            <FieldLabelText>Status</FieldLabelText>
            <View style={[a.flex_row, a.gap_xs]}>
              <Chip
                label="Ativo"
                selected={draft.status === 'active'}
                onPress={() => setDraft(d => ({...d, status: 'active'}))}
              />
              <Chip
                label="Rascunho"
                selected={draft.status === 'draft'}
                onPress={() => setDraft(d => ({...d, status: 'draft'}))}
              />
            </View>
          </View>
        </>
      )}

      <View
        style={[
          a.flex_row,
          a.flex_wrap,
          a.gap_sm,
          a.align_center,
          a.pt_md,
          a.border_t,
          t.atoms.border_contrast_low,
        ]}>
        <Button
          label="Publicar alterações"
          size="large"
          color="primary"
          disabled={!dirty || save.isPending}
          onPress={publish}>
          <ButtonText>{save.isPending ? 'Publicando…' : 'Publicar'}</ButtonText>
        </Button>
        <Button
          label="Descartar alterações"
          size="large"
          color="secondary"
          disabled={!dirty || save.isPending}
          onPress={() => {
            setDraftState(JSON.parse(base))
            setLocal({})
          }}>
          <ButtonText>Descartar</ButtonText>
        </Button>
        <Text
          accessibilityLiveRegion="polite"
          style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {message ?? (dirty ? 'Alterações não publicadas' : 'Tudo publicado')}
        </Text>
      </View>
    </View>
  )

  const preview = (
    <View style={[a.flex_1, {minWidth: 0}]}>
      <ChannelPreview
        profile={profile}
        draft={draft}
        bannerUri={bannerUri}
        watermarkUri={watermarkUri}
        videos={data.videos}
        drops={data.drops}
        live={data.live}
      />
    </View>
  )

  return gtTablet ? (
    <View style={[a.flex_row, a.gap_xl, a.align_start]}>
      {editor}
      {preview}
    </View>
  ) : (
    <View style={[a.gap_xl]}>
      {editor}
      {preview}
    </View>
  )
}
