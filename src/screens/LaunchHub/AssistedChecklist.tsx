import {useState} from 'react'
import {Linking, View} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import * as Sharing from 'expo-sharing'

import {aquaPostUrl, isAssisted, prepareAssist} from '#/lib/launch-hub/assist'
import {VERIFICATION_LABELS} from '#/lib/launch-hub/destinations'
import {resolveAssetUri} from '#/lib/launch-hub/media-cache'
import {type Launch, type LaunchDestination} from '#/lib/launch-hub/types'
import {isNative} from '#/platform/detection'
import {useAssistPrefs, useLaunchApi} from '#/state/launch-hub/store'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {
  Card,
  NoticeText,
  PillText,
  ProviderBadge,
  SectionTitleText,
  StatusPill,
} from './components'

const DONE = new Set(['published', 'skipped'])

/**
 * "Publicar em todas", passo assistido: one card per network that has no
 * automatic publishing. The Aqua prepares the text and opens the network's own
 * composer; the person publishes there and marks it here. Nothing is posted
 * behind their back, and no logged-in session is automated.
 */
export function AssistedChecklist({launch}: {launch: Launch}) {
  const assisted = launch.destinations.filter(isAssisted)
  if (!assisted.length) return null
  const done = assisted.filter(d => DONE.has(d.status)).length
  const current = assisted.find(d => !DONE.has(d.status))
  const aquaUrl = aquaPostUrl(launch)
  const auto = launch.destinations.filter(d => !isAssisted(d))
  const autoRunning = auto.some(
    d => d.status === 'pending' || d.status === 'processing',
  )

  return (
    <View style={[a.gap_sm]}>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <View style={[a.flex_1]}>
          <SectionTitleText>Publicação assistida</SectionTitleText>
        </View>
        <PillText tone={done === assisted.length ? 'positive' : 'warning'}>
          {`${done} de ${assisted.length}`}
        </PillText>
      </View>
      <NoticeText>
        Estas redes não publicam sozinhas pela Aqua. Para cada uma: copie o
        texto, abra a rede (a tela de postar já vem preenchida quando a rede
        permite), publique lá e marque aqui. Nada sai sem o seu toque.
      </NoticeText>
      {autoRunning && (
        <NoticeText>
          O link de volta para a Aqua entra no texto assim que o post na Aqua
          sair.
        </NoticeText>
      )}
      {assisted.map((d, index) => (
        <AssistedCard
          key={d.id}
          launch={launch}
          destination={d}
          step={index + 1}
          total={assisted.length}
          expanded={d.id === current?.id || d.status === 'opened'}
          aquaUrl={aquaUrl}
        />
      ))}
    </View>
  )
}

function AssistedCard({
  launch,
  destination,
  step,
  total,
  expanded: initiallyExpanded,
  aquaUrl,
}: {
  launch: Launch
  destination: LaunchDestination
  step: number
  total: number
  expanded: boolean
  aquaUrl: string | undefined
}) {
  const t = useTheme()
  const {markAssisted} = useLaunchApi()
  const {prefs, setPrefs} = useAssistPrefs()
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const expanded = open ?? initiallyExpanded
  const prep = prepareAssist(launch, destination, {
    aquaUrl,
    instance: prefs.mastodonInstance,
  })
  const {def, adapted, openUrl, copyText} = prep
  const spec = def.assist
  const media = launch.contentPackage.media
  const mark = (action: Parameters<typeof markAssisted>[2], error?: string) =>
    markAssisted(launch.id, destination.id, action, {error})

  const copy = async (silent = false) => {
    await Clipboard.setStringAsync(copyText)
    if (!silent) Toast.show('Texto copiado')
  }

  const onOpen = async () => {
    if (!openUrl) return
    // the text goes along on the clipboard, for networks that can't prefill it
    await copy(true)
    try {
      await Linking.openURL(openUrl)
      mark('abrir')
      if (!(spec?.kind === 'intent' && spec.prefills.includes('texto')))
        Toast.show('Texto copiado: é só colar na rede')
    } catch (e) {
      mark('erro', `Não abriu ${def.name}: ${String(e)}`)
    }
  }

  const onShareMedia = async () => {
    const uri = media[0] ? resolveAssetUri(media[0]) : undefined
    if (!uri) return
    await copy(true)
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('compartilhar indisponível neste aparelho')
      await Sharing.shareAsync(uri, {
        mimeType: media[0]!.mime,
        dialogTitle: `Enviar para ${def.name}`,
      })
      mark('abrir')
      Toast.show('Legenda copiada: cole na rede')
    } catch (e) {
      Toast.show(String(e instanceof Error ? e.message : e), 'xmark')
    }
  }

  return (
    <Card>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <ProviderBadge provider={def.id} size={28} />
        <View style={[a.flex_1]}>
          <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
            {def.name}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Passo {step} de {total}
          </Text>
        </View>
        <StatusPill status={destination.status} />
        <Button
          label={expanded ? 'Recolher' : 'Expandir'}
          size="tiny"
          color="secondary"
          variant="ghost"
          onPress={() => setOpen(!expanded)}>
          <ButtonText>{expanded ? '−' : '+'}</ButtonText>
        </Button>
      </View>

      {expanded && (
        <>
          <View
            style={[a.rounded_sm, a.p_md, a.gap_xs, t.atoms.bg_contrast_25]}>
            {prep.post.title && def.id !== 'reddit' && (
              <Text style={[a.text_md, a.font_bold]}>{prep.post.title}</Text>
            )}
            <Text style={[a.text_sm, a.leading_snug]} selectable>
              {adapted.text || '(sem texto)'}
            </Text>
            {adapted.url && (
              <Text
                style={[a.text_xs, t.atoms.text_contrast_medium]}
                numberOfLines={1}>
                Link: {adapted.url}
              </Text>
            )}
          </View>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {adapted.length}/{adapted.limit} caracteres
            {def.capabilities.text.counting === 'x'
              ? ' (links contam 23, como no X)'
              : ''}
            {adapted.truncated ? ' · texto cortado para caber' : ''}
            {spec ? ` · ${VERIFICATION_LABELS[spec.verified]}` : ''}
          </Text>
          {spec?.note && (
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              {spec.note}
            </Text>
          )}

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
          {prep.missing && (
            <Text style={[a.text_xs, {color: '#9a5b00'}]}>{prep.missing}</Text>
          )}
          {destination.error && (
            <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
              {destination.error}
            </Text>
          )}

          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            <Button
              label="Copiar texto"
              size="small"
              color="secondary"
              onPress={() => copy()}>
              <ButtonText>Copiar texto</ButtonText>
            </Button>
            <Button
              label={`Abrir no ${def.name}`}
              size="small"
              color="primary"
              disabled={!openUrl}
              onPress={onOpen}>
              <ButtonText>Abrir no {def.name}</ButtonText>
            </Button>
            {isNative && media.length > 0 && spec?.mediaByShareSheet && (
              <Button
                label={`Compartilhar mídia com ${def.name}`}
                size="small"
                color="secondary"
                onPress={onShareMedia}>
                <ButtonText>Compartilhar mídia</ButtonText>
              </Button>
            )}
          </View>
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {destination.status !== 'published' && (
              <Button
                label="Marcar como publicado"
                size="small"
                color="primary_subtle"
                onPress={() => mark('publicado')}>
                <ButtonText>Marcar como publicado</ButtonText>
              </Button>
            )}
            {destination.status === 'opened' && (
              <Button
                label="Não deu certo"
                size="small"
                color="negative_subtle"
                onPress={() => mark('erro')}>
                <ButtonText>Não deu certo</ButtonText>
              </Button>
            )}
            {!DONE.has(destination.status) ? (
              <Button
                label="Pular esta rede"
                size="small"
                color="secondary"
                variant="ghost"
                onPress={() => mark('pular')}>
                <ButtonText>Pular</ButtonText>
              </Button>
            ) : (
              <Button
                label="Voltar para pendente"
                size="small"
                color="secondary"
                variant="ghost"
                onPress={() => mark('reabrir')}>
                <ButtonText>Desfazer</ButtonText>
              </Button>
            )}
          </View>
        </>
      )}
    </Card>
  )
}
