import {useState} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {LIMITS, newChannelRecord} from '#/lib/view-channel/model'
import {useSaveViewChannelMutation} from '#/state/queries/view-channel'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  BannerEditor,
  ChannelPreview,
  type Draft,
  Field,
  HandleReadOnly,
  InheritedIdentity,
  LanguagePicker,
  type LocalImages,
  TopicsField,
  VisibilityPicker,
} from './editor'
import {useChannelData} from './useChannelData'
import {ViewShell} from './ViewShell'

const STEPS = [
  'Identidade',
  'Informações do canal',
  'Visual',
  'Preferências',
  'Revisão',
] as const

export function ViewChannelCreateScreen() {
  return (
    <ViewShell title="Criar canal" testID="viewChannelCreateScreen">
      <CreateChannel />
    </ViewShell>
  )
}

/**
 * Creates the View Channel of the signed-in AQUA Profile. No account, auth
 * or profile is created: the result is one record in the user's own repo.
 */
function CreateChannel() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const data = useChannelData(currentAccount?.did)
  const save = useSaveViewChannelMutation()
  const [step, setStep] = useState(0)
  const [draft, setDraftState] = useState<Draft>(() => newChannelRecord())
  const [local, setLocal] = useState<LocalImages>({})
  const [error, setError] = useState<string>()
  const setDraft = (fn: (d: Draft) => Draft) => setDraftState(fn)

  const profile = data.profile.data
  if (!profile || data.channelQuery.isLoading)
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>Carregando…</Text>
    )
  if (data.channel)
    return (
      <View style={[a.p_xl, a.gap_md, a.align_center]}>
        <Text style={[a.text_2xl, a.font_bold]}>Você já tem um canal</Text>
        <Link to={`/views/channel/${profile.handle}`} label="Ver meu canal">
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Ver meu canal →
          </Text>
        </Link>
      </View>
    )

  const create = async () => {
    setError(undefined)
    try {
      await save.mutateAsync({...draft, status: 'active'})
      navigation.navigate('ViewChannel', {handle: profile.handle})
    } catch {
      setError('Não foi possível criar o canal. Tente novamente.')
    }
  }

  const bannerUri = local.banner
  return (
    <View style={[a.p_lg, a.gap_lg, {maxWidth: 1100}]}>
      <View style={[a.gap_xs]}>
        <Text style={[a.text_3xl, a.font_bold]}>Crie seu canal no View</Text>
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          Seu canal é a presença do seu perfil AQUA no View. Nada de conta nova.
        </Text>
      </View>

      <View
        accessibilityRole="progressbar"
        style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {STEPS.map((label, i) => (
          <Text
            key={label}
            style={[
              a.text_sm,
              i === step ? a.font_bold : t.atoms.text_contrast_medium,
            ]}>
            {i + 1}. {label}
            {i < STEPS.length - 1 ? '  ›' : ''}
          </Text>
        ))}
      </View>

      <View style={[a.gap_lg, {maxWidth: step === 4 ? undefined : 640}]}>
        {step === 0 && (
          <>
            <Text style={[a.text_lg, a.font_bold]}>Usar seu perfil AQUA</Text>
            <InheritedIdentity profile={profile} />
          </>
        )}
        {step === 1 && (
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
              label="Descrição curta"
              value={draft.description ?? ''}
              onChange={v =>
                setDraft(d => ({...d, description: v || undefined}))
              }
              multiline
              maxLength={LIMITS.description}
            />
          </>
        )}
        {step === 2 && (
          <>
            <BannerEditor
              draft={draft}
              setDraft={setDraft}
              bannerUri={bannerUri}
              setLocal={setLocal}
            />
            <InheritedIdentity profile={profile} />
          </>
        )}
        {step === 3 && (
          <>
            <LanguagePicker draft={draft} setDraft={setDraft} />
            <TopicsField draft={draft} setDraft={setDraft} />
            <VisibilityPicker draft={draft} setDraft={setDraft} />
          </>
        )}
        {step === 4 && (
          <ChannelPreview
            profile={profile}
            draft={draft}
            bannerUri={bannerUri}
            videos={data.videos}
            drops={data.drops}
            live={data.live}
          />
        )}
      </View>

      {error && <Text style={[a.text_sm, {color: '#d6336c'}]}>{error}</Text>}
      <View style={[a.flex_row, a.gap_sm]}>
        {step > 0 && (
          <Button
            label="Voltar"
            size="large"
            color="secondary"
            onPress={() => setStep(s => s - 1)}>
            <ButtonText>Voltar</ButtonText>
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            label="Continuar"
            size="large"
            color="primary"
            onPress={() => setStep(s => s + 1)}>
            <ButtonText>Continuar</ButtonText>
          </Button>
        ) : (
          <Button
            label="Criar canal"
            size="large"
            color="primary"
            disabled={save.isPending}
            onPress={create}>
            <ButtonText>
              {save.isPending ? 'Criando…' : 'Criar canal'}
            </ButtonText>
          </Button>
        )}
      </View>
    </View>
  )
}
