import {Linking, View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {type IuChatView} from '#/lib/iu-chat'
import {isWeb} from '#/platform/detection'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {IUChatIcon} from '#/components/icons/IUChat'
import {Text} from '#/components/Typography'

export function openIuChatFullPage(url: string) {
  if (isWeb && typeof window !== 'undefined') {
    window.location.assign(url)
    return
  }
  Linking.openURL(url)
}

export function IUChatUnavailable({
  status,
  url,
  onRetry,
}: {
  status: Exclude<IuChatView, 'embed'> | 'loading'
  url: string
  onRetry: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const loading = status === 'loading'
  return (
    <View
      style={[a.flex_1, a.align_center, a.justify_center, a.px_xl, a.gap_lg]}>
      <IUChatIcon size={72} />
      <Text style={[a.text_2xl, a.font_bold, a.text_center]}>IU Chat</Text>
      <Text
        style={[
          a.text_md,
          a.text_center,
          a.leading_snug,
          t.atoms.text_contrast_medium,
          {maxWidth: 460},
        ]}>
        {loading
          ? 'Abrindo o IU Chat…'
          : status === 'down'
            ? 'Não consegui abrir o IU Chat. Confira se ele está rodando e tente de novo.'
            : status === 'cross-site'
              ? 'Este endereço do IU Chat é outro site, então o login não fica salvo dentro do Aqua. Abra em página inteira ou use um endereço no mesmo site.'
              : 'O IU Chat não autorizou ser mostrado dentro do Aqua. Abra em página inteira para conversar.'}
      </Text>
      {!loading && (
        <Text style={[a.text_sm, a.text_center, t.atoms.text_contrast_low]}>
          {url}
        </Text>
      )}
      {!loading && (
        <View style={[a.flex_row, a.gap_sm, a.flex_wrap, a.justify_center]}>
          {status !== 'down' && (
            <Button
              label={_(msg`Abrir em página inteira`)}
              size="large"
              color="primary"
              onPress={() => openIuChatFullPage(url)}>
              <ButtonText>Abrir em página inteira</ButtonText>
            </Button>
          )}
          <Button
            label={_(msg`Tentar de novo`)}
            size="large"
            color={status === 'down' ? 'primary' : 'secondary'}
            variant={status === 'down' ? 'solid' : 'outline'}
            onPress={onRetry}>
            <ButtonText>Tentar de novo</ButtonText>
          </Button>
        </View>
      )}
    </View>
  )
}
