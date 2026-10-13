/**
 * "Publicar em todas" (Aquarela's mockup, docs/launch-hub/modo-assistido.md):
 * the composer card, the automatic destinations, the assisted cards with
 * their 4 states (pendente, aberto, publicado, erro) and a capsule dock that
 * shows progress and opens the next network.
 *
 * Nothing is posted behind the person's back: assisted networks open their own
 * composer (or the share sheet) and the person publishes there.
 */
import {useState} from 'react'
import {Linking, Platform, StyleSheet, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import {Image} from 'expo-image'
import {LinearGradient} from 'expo-linear-gradient'
import * as Sharing from 'expo-sharing'

import {
  aquaPostUrl,
  assistProgress,
  assistSubtitle,
  isAssisted,
  isDone,
  mediaNotice,
  openInNewTab,
  prepareAssist,
  type PreparedAssist,
} from '#/lib/launch-hub/assist'
import {
  getDestination,
  VERIFICATION_LABELS,
} from '#/lib/launch-hub/destinations'
import {adaptPost} from '#/lib/launch-hub/formatting'
import {resolveAssetUri} from '#/lib/launch-hub/media-cache'
import {
  type DestinationStatus,
  type Launch,
  type LaunchDestination,
  type ManagedProfile,
  type ProviderId,
} from '#/lib/launch-hub/types'
import {isNative, isWeb} from '#/platform/detection'
import {useAssistPrefs, useLaunchApi} from '#/state/launch-hub/store'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {GlassSurface} from '#/components/GlassSurface'
import {ArrowOutOfBox_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import {ArrowRotateCounterClockwise_Stroke2_Corner0_Rounded as RetryIcon} from '#/components/icons/ArrowRotateCounterClockwise'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {CircleInfo_Stroke2_Corner0_Rounded as InfoIcon} from '#/components/icons/CircleInfo'
import {Clipboard_Stroke2_Corner2_Rounded as CopyIcon} from '#/components/icons/Clipboard'
import {SquareArrowTopRight_Stroke2_Corner0_Rounded as ExternalIcon} from '#/components/icons/SquareArrowTopRight'
import {Zap_Stroke2_Corner0_Rounded as BoltIcon} from '#/components/icons/Zap'
import {Text} from '#/components/Typography'
import {
  AQUA,
  type AssistTone,
  BAR_GRADIENT,
  glass,
  RADIUS,
  SKY_GRADIENT,
  strong,
  toneColors,
} from './aqua-look'
import {ProfileAvatar, ProviderBadge} from './components'

/** Room the content leaves at the bottom so the dock never covers a card. */
export const DOCK_SPACE = 120

const TONE: Record<DestinationStatus, AssistTone> = {
  pending: 'pend',
  scheduled: 'pend',
  processing: 'open',
  opened: 'open',
  published: 'ok',
  failed: 'err',
  skipped: 'skip',
}
const LABEL: Record<DestinationStatus, string> = {
  pending: 'Pendente',
  scheduled: 'Agendado',
  processing: 'Publicando',
  opened: 'Aberto',
  published: 'Publicado',
  failed: 'Erro',
  skipped: 'Ignorado',
}

// ---------- building blocks

/** Light-mode sky behind the glass (the mockup's page background). */
export function SkyBackground() {
  const t = useTheme()
  if (t.scheme === 'dark') return null
  return (
    <LinearGradient
      colors={[...SKY_GRADIENT]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  )
}

function GlassSection({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <GlassSurface
      style={[a.p_lg, a.gap_md, {borderRadius: RADIUS.section}]}
      fallbackStyle={glass(t.scheme === 'dark')}>
      {children}
    </GlassSurface>
  )
}

function SectionHead({
  icon: Icon,
  title,
  tag,
}: {
  icon?: typeof BoltIcon
  title: string
  tag?: string
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_sm]}>
      {Icon && <Icon size="sm" style={t.atoms.text_contrast_medium} />}
      <Text
        style={[
          a.text_xs,
          a.font_bold,
          t.atoms.text_contrast_medium,
          {letterSpacing: 0.8, textTransform: 'uppercase'},
        ]}>
        {title}
      </Text>
      {tag && (
        <Text
          style={[
            a.text_xs,
            t.atoms.text_contrast_medium,
            {marginLeft: 'auto'},
          ]}>
          {tag}
        </Text>
      )}
    </View>
  )
}

/** `.st`: status capsule with a dot. */
export function AssistStatus({status}: {status: DestinationStatus}) {
  const t = useTheme()
  const {fg, bg} = toneColors(TONE[status], t.scheme === 'dark')
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.rounded_full,
        a.gap_xs,
        {paddingHorizontal: 10, paddingVertical: 5, backgroundColor: bg},
      ]}>
      <View
        style={[a.rounded_full, {width: 7, height: 7, backgroundColor: fg}]}
      />
      <Text style={[a.text_xs, a.font_bold, {color: fg}]}>{LABEL[status]}</Text>
    </View>
  )
}

/** `.net`: rounded-square network tile with the official logo (see ProviderBadge). */
function NetTile({provider}: {provider: ProviderId}) {
  return <ProviderBadge provider={provider} size={36} shape="square" />
}

function NetName({name, sub}: {name: string; sub: string}) {
  const t = useTheme()
  return (
    <View style={[a.flex_1]}>
      <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[a.text_xs, t.atoms.text_contrast_medium]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

function Note({text, error}: {text: string; error?: boolean}) {
  const t = useTheme()
  const color = error ? '#a3361a' : t.atoms.text_contrast_medium.color
  return (
    <View style={[a.flex_row, a.gap_xs, a.align_start]}>
      <InfoIcon size="xs" style={{color, marginTop: 2}} />
      <Text style={[a.flex_1, a.text_xs, a.leading_snug, {color}]}>{text}</Text>
    </View>
  )
}

// ---------- actions

/** Copy / open / share for one assisted destination (shared by card and dock). */
function useAssistActions(
  launch: Launch,
  destination: LaunchDestination | undefined,
) {
  const {markAssisted} = useLaunchApi()
  const {prefs} = useAssistPrefs()
  const prep: PreparedAssist | undefined = destination
    ? prepareAssist(launch, destination, {
        aquaUrl: aquaPostUrl(launch),
        instance: prefs.mastodonInstance,
      })
    : undefined
  const media = launch.contentPackage.media
  const mark = (action: Parameters<typeof markAssisted>[2], error?: string) =>
    destination && markAssisted(launch.id, destination.id, action, {error})

  const copy = (silent = false) => {
    if (!prep) return Promise.resolve()
    return Clipboard.setStringAsync(prep.copyText)
      .then(() => {
        if (!silent) Toast.show('Texto copiado')
      })
      .catch(() => {})
  }

  /**
   * Opens the network's composer. The clipboard write starts first but is not
   * awaited, so the browser still sees the click. On web, a blocked pop-up
   * makes `window.open` return null; Linking.openURL still resolves then, so
   * the web path checks the window itself before marking it opened.
   */
  const open = () => {
    if (!prep?.openUrl) return
    const url = prep.openUrl
    const name = prep.def.name
    const spec = prep.def.assist
    copy(true)
    const opened = () => {
      mark('abrir')
      if (!(spec?.kind === 'intent' && spec.prefills.includes('texto')))
        Toast.show('Texto copiado: é só colar na rede')
    }
    if (isWeb) {
      if (openInNewTab(url)) opened()
      else mark('erro', `${name} não abriu. Confira se o pop-up foi bloqueado.`)
      return
    }
    Linking.openURL(url).then(
      () => opened(),
      e => mark('erro', `${name} não abriu (${String(e)}).`),
    )
  }

  const canShareMedia =
    isNative && media.length > 0 && !!prep?.def.assist?.mediaByShareSheet

  const shareMedia = async () => {
    const uri = media[0] ? resolveAssetUri(media[0]) : undefined
    if (!uri || !prep) return
    await copy(true)
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('compartilhar indisponível neste aparelho')
      await Sharing.shareAsync(uri, {
        mimeType: media[0]!.mime,
        dialogTitle: `Enviar para ${prep.def.name}`,
      })
      mark('abrir')
      Toast.show('Legenda copiada: cole na rede')
    } catch (e) {
      Toast.show(String(e instanceof Error ? e.message : e), 'xmark')
    }
  }

  return {prep, copy, open, mark, canShareMedia, shareMedia}
}

// ---------- the screen body

export function PublishAllView({
  launch,
  profiles,
  onRetryAuto,
  footer,
}: {
  launch: Launch
  profiles: ManagedProfile[]
  onRetryAuto: (destinationIds: string[]) => void
  footer?: React.ReactNode
}) {
  const t = useTheme()
  const auto = launch.destinations.filter(d => !isAssisted(d))
  const assisted = launch.destinations.filter(isAssisted)
  const progress = assistProgress(launch.destinations)

  return (
    <View style={[a.gap_lg, {paddingBottom: DOCK_SPACE}]}>
      <View style={[a.gap_xs]}>
        <Text style={[a.text_3xl, a.font_bold, {letterSpacing: -0.8}]}>
          Publicar em todas
        </Text>
        <Text style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
          Publicamos sozinhos onde dá. Nas outras redes, a gente abre a tela de
          postar já preenchida e você só toca em “Publicar”.
        </Text>
      </View>

      <Composer launch={launch} profiles={profiles} />

      {auto.length > 0 && (
        <GlassSection>
          <SectionHead
            icon={BoltIcon}
            title="Automático"
            tag={
              auto.every(d => d.status === 'published')
                ? 'publicado agora'
                : `${auto.filter(isDone).length} de ${auto.length}`
            }
          />
          <View style={[a.gap_md]}>
            {auto.map(d => (
              <AutoRow key={d.id} destination={d} onRetry={onRetryAuto} />
            ))}
          </View>
        </GlassSection>
      )}

      {assisted.length > 0 && (
        <GlassSection>
          <SectionHead
            icon={ShareIcon}
            title="Assistido"
            tag={`${progress.assistedDone} de ${progress.assistedTotal} feitas`}
          />
          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            {(['pending', 'opened', 'published', 'failed'] as const).map(s => (
              <AssistStatus key={s} status={s} />
            ))}
          </View>
          <View style={[a.gap_md]}>
            {assisted.map(d => (
              <AssistedCard key={d.id} launch={launch} destination={d} />
            ))}
          </View>
        </GlassSection>
      )}
      {footer}
    </View>
  )
}

function Composer({
  launch,
  profiles,
}: {
  launch: Launch
  profiles: ManagedProfile[]
}) {
  const t = useTheme()
  const dark = t.scheme === 'dark'
  const content = launch.contentPackage
  const aquaDest = launch.destinations.find(d => d.provider === 'aqua')
  const author = profiles.find(p => p.key === aquaDest?.profileKey)
  const link = content.link?.trim() || aquaPostUrl(launch)
  const image = content.media.find(m => m.kind === 'image')
  const imageUri = image ? resolveAssetUri(image) : undefined
  const xDest = launch.destinations.find(d => d.provider === 'x')
  // the counter follows X when it's in the launch (the tightest limit), else the Aqua
  const counted = xDest
    ? prepareAssist(launch, xDest, {aquaUrl: aquaPostUrl(launch)}).adapted
    : adaptPost(
        {text: content.text, link: content.link, tags: content.tags},
        getDestination('aqua').capabilities.text,
      )
  const images = content.media.filter(m => m.kind === 'image').length
  const notice = mediaNotice(
    launch.destinations.filter(isAssisted).map(d => getDestination(d.provider)),
  )

  return (
    <GlassSection>
      <SectionHead title="Seu post" />
      <View
        style={[a.p_md, a.gap_sm, strong(dark), {borderRadius: RADIUS.row}]}>
        {author && (
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <ProfileAvatar profile={author} size={34} />
            <View style={[a.flex_1]}>
              <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
                {author.displayName}
              </Text>
              {author.handle && (
                <Text
                  style={[a.text_xs, t.atoms.text_contrast_medium]}
                  numberOfLines={1}>
                  @{author.handle}
                </Text>
              )}
            </View>
          </View>
        )}
        {!!(content.title?.trim() || '') && (
          <Text style={[a.text_md, a.font_bold]}>{content.title}</Text>
        )}
        <Text style={[a.text_sm, a.leading_snug]}>
          {content.text.trim() || content.description?.trim() || '(sem texto)'}
        </Text>
        {imageUri ? (
          <Image
            source={{uri: imageUri}}
            style={[{height: 150, borderRadius: 12}]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        {link && (
          <Text
            style={[a.text_xs, a.font_bold, {color: AQUA.blue}]}
            numberOfLines={1}>
            {link.replace(/^https?:\/\//, '')}
          </Text>
        )}
      </View>
      <View style={[a.flex_row, a.justify_between]}>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {[
            images ? `${images} ${images === 1 ? 'imagem' : 'imagens'}` : null,
            link ? '1 link' : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'só texto'}
        </Text>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {counted.length} / {counted.limit}
          {xDest ? ' no X' : ''}
        </Text>
      </View>
      {notice && (
        <View
          style={[
            a.p_sm,
            {
              borderRadius: 12,
              backgroundColor: 'rgba(240,76,36,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(240,76,36,0.22)',
            },
          ]}>
          <Text
            style={[
              a.text_xs,
              a.leading_snug,
              {color: dark ? '#ffb39e' : '#8a3a12'},
            ]}>
            {notice}
          </Text>
        </View>
      )}
    </GlassSection>
  )
}

function AutoRow({
  destination,
  onRetry,
}: {
  destination: LaunchDestination
  onRetry: (ids: string[]) => void
}) {
  const t = useTheme()
  const def = getDestination(destination.provider)
  const sub =
    destination.provider === 'aqua'
      ? 'no seu perfil e site'
      : def.sameNetworkAs
        ? 'mesmo post'
        : 'automático'
  return (
    <View
      style={[
        a.p_md,
        a.gap_sm,
        strong(t.scheme === 'dark'),
        {borderRadius: RADIUS.row},
      ]}>
      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        <NetTile provider={destination.provider} />
        <NetName name={def.name} sub={sub} />
        <AssistStatus status={destination.status} />
      </View>
      {destination.status === 'failed' && (
        <>
          {destination.error && <Note error text={destination.error} />}
          <View style={[a.flex_row]}>
            <Button
              label={`Tentar de novo em ${def.name}`}
              size="small"
              color="primary"
              onPress={() => onRetry([destination.id])}>
              <ButtonIcon icon={RetryIcon} />
              <ButtonText>Tentar de novo</ButtonText>
            </Button>
          </View>
        </>
      )}
    </View>
  )
}

function AssistedCard({
  launch,
  destination,
}: {
  launch: Launch
  destination: LaunchDestination
}) {
  const t = useTheme()
  const dark = t.scheme === 'dark'
  const {prefs, setPrefs} = useAssistPrefs()
  const {prep, copy, open, mark, canShareMedia, shareMedia} = useAssistActions(
    launch,
    destination,
  )
  const [showDetails, setShowDetails] = useState(false)
  if (!prep) return null
  const {def, adapted, openUrl} = prep
  const spec = def.assist
  const status = destination.status
  const done = isDone(destination)
  const isInstagram = def.id === 'instagram'
  const copyLabel = isInstagram ? 'Copiar legenda' : 'Copiar texto'

  const stateStyle =
    status === 'opened'
      ? {
          borderColor: 'rgba(0,43,239,0.45)',
          ...(web({boxShadow: '0 0 0 4px rgba(0,43,239,0.08)'}) as object),
        }
      : status === 'failed'
        ? {borderColor: 'rgba(240,76,36,0.45)'}
        : done
          ? {opacity: 0.72}
          : {}

  const primaryOpen = (label: string, icon = ExternalIcon) => (
    <Button
      label={label}
      size="small"
      color="primary"
      disabled={!openUrl}
      onPress={open}>
      <ButtonIcon icon={icon} />
      <ButtonText>{label}</ButtonText>
    </Button>
  )
  const copyButton = (
    <Button
      label={copyLabel}
      size="small"
      color="secondary"
      onPress={() => copy()}>
      <ButtonIcon icon={CopyIcon} />
      <ButtonText>{copyLabel}</ButtonText>
    </Button>
  )

  return (
    <View
      style={[
        a.p_md,
        a.gap_sm,
        strong(dark),
        {borderRadius: RADIUS.card},
        stateStyle,
      ]}>
      <View style={[a.flex_row, a.align_center, a.gap_md]}>
        <NetTile provider={def.id} />
        <NetName name={def.name} sub={assistSubtitle(def)} />
        <AssistStatus status={status} />
      </View>

      {done ? (
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          {status === 'published' && (
            <View style={[a.flex_row, a.align_center, a.gap_xs, a.py_xs]}>
              <CheckIcon size="sm" style={{color: toneColors('ok', dark).fg}} />
              <Text
                style={[
                  a.text_sm,
                  a.font_bold,
                  {color: toneColors('ok', dark).fg},
                ]}>
                Marcado como publicado
              </Text>
            </View>
          )}
          <Button
            label="Desfazer: voltar para pendente"
            size="tiny"
            color="secondary"
            variant="ghost"
            onPress={() => mark('reabrir')}>
            <ButtonText>Desfazer</ButtonText>
          </Button>
        </View>
      ) : (
        <>
          {!isInstagram && (
            <Preview text={adapted.text} url={adapted.url} dark={dark} />
          )}

          {status === 'opened' && (
            <Note
              text={
                isWeb
                  ? `Abrimos o ${def.name} numa nova aba. Publicou lá? Volte e marque aqui.`
                  : `Abrimos o ${def.name}. Publicou lá? Volte e marque aqui.`
              }
            />
          )}
          {status === 'failed' && (
            <Note error text={destination.error || `${def.name} não abriu.`} />
          )}
          {isInstagram && status !== 'opened' && (
            <Note
              text={
                'Copie a legenda primeiro: o Instagram abre só com a imagem.'
              }
            />
          )}
          {spec?.note && !isInstagram && status === 'pending' && (
            <Note text={spec.note} />
          )}
          {prep.missing && <Note error text={prep.missing} />}

          {spec?.needsInstance && (
            <View>
              <TextField.LabelText>Seu servidor</TextField.LabelText>
              <TextField.Root>
                <TextField.Input
                  label="Seu servidor do Mastodon"
                  placeholder="mastodon.social"
                  autoCapitalize="none"
                  autoCorrect={false}
                  defaultValue={prefs.mastodonInstance}
                  onChangeText={v => setPrefs({mastodonInstance: v.trim()})}
                />
              </TextField.Root>
            </View>
          )}

          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            {copyButton}
            {isInstagram && canShareMedia ? (
              <Button
                label="Compartilhar imagem"
                size="small"
                color="primary"
                onPress={shareMedia}>
                <ButtonIcon icon={ShareIcon} />
                <ButtonText>Compartilhar imagem</ButtonText>
              </Button>
            ) : status === 'opened' ? (
              <>
                <Button
                  label="Abrir de novo"
                  size="small"
                  color="secondary"
                  disabled={!openUrl}
                  onPress={open}>
                  <ButtonIcon icon={ExternalIcon} />
                  <ButtonText>Abrir de novo</ButtonText>
                </Button>
                <Button
                  label="Marcar como publicado"
                  size="small"
                  color="primary"
                  onPress={() => mark('publicado')}>
                  <ButtonIcon icon={CheckIcon} />
                  <ButtonText>Marcar como publicado</ButtonText>
                </Button>
              </>
            ) : status === 'failed' ? (
              primaryOpen('Tentar de novo', RetryIcon)
            ) : (
              primaryOpen(`Abrir no ${def.name}`)
            )}
            {canShareMedia && !isInstagram && (
              <Button
                label={`Compartilhar mídia com ${def.name}`}
                size="small"
                color="secondary"
                onPress={shareMedia}>
                <ButtonIcon icon={ShareIcon} />
                <ButtonText>Compartilhar mídia</ButtonText>
              </Button>
            )}
          </View>

          <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
            {status === 'opened' && (
              <Button
                label="Não deu certo"
                size="tiny"
                color="secondary"
                variant="ghost"
                onPress={() => mark('erro')}>
                <ButtonText>Não deu certo</ButtonText>
              </Button>
            )}
            {(status === 'pending' || status === 'failed' || isInstagram) &&
              status !== 'opened' && (
                <Button
                  label="Marcar como publicado"
                  size="tiny"
                  color="secondary"
                  variant="ghost"
                  onPress={() => mark('publicado')}>
                  <ButtonText>Já publiquei</ButtonText>
                </Button>
              )}
            <Button
              label="Pular esta rede"
              size="tiny"
              color="secondary"
              variant="ghost"
              onPress={() => mark('pular')}>
              <ButtonText>Pular</ButtonText>
            </Button>
            <Button
              label={showDetails ? 'Esconder detalhes' : 'Ver detalhes'}
              size="tiny"
              color="secondary"
              variant="ghost"
              onPress={() => setShowDetails(!showDetails)}>
              <ButtonText>{showDetails ? 'Menos' : 'Detalhes'}</ButtonText>
            </Button>
          </View>
          {showDetails && (
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              {adapted.length}/{adapted.limit} caracteres
              {def.capabilities.text.counting === 'x'
                ? ' (links contam 23, como no X)'
                : ''}
              {adapted.truncated ? ' · texto cortado para caber' : ''}
              {spec ? ` · ${VERIFICATION_LABELS[spec.verified]}` : ''}
            </Text>
          )}
        </>
      )}
    </View>
  )
}

/** `.prev`: dashed preview, a few lines with a fade at the bottom. */
function Preview({
  text,
  url,
  dark,
}: {
  text: string
  url?: string
  dark: boolean
}) {
  const fade = dark ? 'rgba(21,29,40,0.95)' : 'rgba(255,255,255,0.95)'
  return (
    <View
      style={[
        a.p_sm,
        a.overflow_hidden,
        {
          maxHeight: 78,
          borderRadius: 12,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.14)',
          backgroundColor: dark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(255,255,255,0.7)',
        },
      ]}>
      <Text style={[a.text_sm, a.leading_snug]}>
        {text || '(sem texto)'}
        {url ? ` ${url.replace(/^https?:\/\//, '')}` : ''}
      </Text>
      <LinearGradient
        colors={['transparent', fade]}
        style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 22}}
        pointerEvents="none"
      />
    </View>
  )
}

// ---------- dock

/** `.dock`: capsule with the progress, "Pular" and "Abrir próxima". */
export function PublishAllDock({launch}: {launch: Launch}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const insets = useSafeAreaInsets()
  const progress = assistProgress(launch.destinations)
  const {prep, open, mark, canShareMedia, shareMedia} = useAssistActions(
    launch,
    progress.next,
  )
  if (!progress.assistedTotal) return null
  const finished = !progress.next
  const isInstagram = prep?.def.id === 'instagram'
  const pct = progress.total ? progress.done / progress.total : 0

  return (
    <View
      pointerEvents="box-none"
      style={[
        Platform.OS === 'web'
          ? ({position: 'fixed'} as object)
          : {position: 'absolute'},
        {left: 0, right: 0, bottom: (isNative ? insets.bottom : 0) + 18},
        a.align_center,
        a.px_md,
      ]}>
      <GlassSurface
        interactive
        style={[
          a.flex_row,
          a.align_center,
          a.gap_md,
          a.w_full,
          {
            maxWidth: 600,
            borderRadius: 999,
            paddingVertical: 10,
            paddingRight: 10,
            paddingLeft: 20,
          },
        ]}
        fallbackStyle={glass(t.scheme === 'dark')}>
        <View style={[a.flex_1, {minWidth: 0}]}>
          <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
            {`${progress.done} de ${progress.total} redes`}
            <Text
              style={[a.text_xs, a.font_normal, t.atoms.text_contrast_medium]}>
              {finished ? '  Tudo feito' : `  Próxima: ${prep?.def.name ?? ''}`}
            </Text>
          </Text>
          <View
            style={[
              a.rounded_full,
              a.overflow_hidden,
              {
                height: 6,
                marginTop: 6,
                backgroundColor:
                  t.scheme === 'dark'
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(15,23,42,0.08)',
              },
            ]}>
            <LinearGradient
              colors={[...BAR_GRADIENT]}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 0}}
              style={[
                a.rounded_full,
                {height: 6, width: `${Math.round(pct * 100)}%`},
              ]}
            />
          </View>
        </View>
        {!finished && gtMobile && (
          <Button
            label={`Pular ${prep?.def.name ?? ''}`}
            size="large"
            color="secondary"
            onPress={() => mark('pular')}>
            <ButtonText>Pular</ButtonText>
          </Button>
        )}
        {!finished &&
          (isInstagram && canShareMedia ? (
            <Button
              label="Compartilhar imagem no Instagram"
              size="large"
              color="primary"
              onPress={shareMedia}>
              <ButtonIcon icon={ShareIcon} />
              <ButtonText>Compartilhar</ButtonText>
            </Button>
          ) : (
            <Button
              label={`Abrir próxima: ${prep?.def.name ?? ''}`}
              size="large"
              color="primary"
              disabled={!prep?.openUrl}
              onPress={open}>
              <ButtonIcon icon={ExternalIcon} />
              <ButtonText>Abrir próxima</ButtonText>
            </Button>
          ))}
      </GlassSurface>
    </View>
  )
}
