import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {TID} from '@atproto/common-web'
import {StackActions, useNavigation} from '@react-navigation/native'
import {type NativeStackScreenProps} from '@react-navigation/native-stack'

import {getAdapter} from '#/lib/launch-hub/adapters'
import {
  FIELD_LABELS,
  getLaunchType,
  LAUNCH_TYPES,
  type LaunchTypeField,
} from '#/lib/launch-hub/launch-types'
import {rememberAssetUri, resolveAssetUri} from '#/lib/launch-hub/media-cache'
import {getProvider, providersByCategory} from '#/lib/launch-hub/providers'
import {runDestinations} from '#/lib/launch-hub/runner'
import {
  type ContentPackage,
  type Launch,
  type LaunchDestination,
  type LaunchType,
  type ManagedProfile,
  type MediaAsset,
  type MusicReleaseMetadata,
} from '#/lib/launch-hub/types'
import {
  getFieldValue,
  validateDestination,
  validateLaunchContent,
} from '#/lib/launch-hub/validation'
import {openPicker} from '#/lib/media/picker'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {useManagedProfiles} from '#/state/launch-hub/profiles'
import {
  useIdentityGroups,
  useLaunch,
  useLaunchApi,
} from '#/state/launch-hub/store'
import {useAgent, useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import * as Toggle from '#/components/forms/Toggle'
import {Image_Stroke2_Corner0_Rounded as ImageIcon} from '#/components/icons/Image'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {
  Card,
  CONNECTION_LABELS,
  NoticeText,
  PillText,
  PROFILE_TYPE_LABELS,
  ProfileAvatar,
  ProviderBadge,
  SectionTitleText,
  ValidationPill,
} from './components'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'LaunchNew'>
type Overrides = Record<
  string,
  Pick<LaunchDestination, 'customCaption' | 'customTitle'>
>

const STEPS = ['Conteúdo', 'Destinos', 'Validação', 'Publicar']
const MAX_IMAGES = 4
const MULTILINE_FIELDS: LaunchTypeField[] = [
  'description',
  'music.credits',
  'music.lyrics',
]

export function NewLaunchScreen({route}: Props) {
  const draft = useLaunch(route.params?.id ?? '')
  // Remount the editor once a draft id resolves, so state hydrates from it.
  return <Editor key={draft?.id ?? 'new'} draft={draft} />
}

function Editor({draft}: {draft: Launch | undefined}) {
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const navigation = useNavigation<NavigationProp>()
  const agent = useAgent()
  const {currentAccount} = useSession()
  const {profiles} = useManagedProfiles()
  const {groups} = useIdentityGroups()
  const {saveLaunch, updateLaunch} = useLaunchApi()

  const [launchId] = useState(() => draft?.id ?? TID.nextStr())
  const [step, setStep] = useState(0)
  const [type, setType] = useState<LaunchType>(draft?.type ?? 'social_post')
  const [content, setContent] = useState<ContentPackage>(
    draft?.contentPackage ?? {text: '', media: []},
  )
  const [identityGroupId, setIdentityGroupId] = useState(draft?.identityGroupId)
  const [selected, setSelected] = useState<string[]>(
    draft?.destinations.map(d => d.profileKey) ?? [],
  )
  const [overrides, setOverrides] = useState<Overrides>(() =>
    Object.fromEntries(
      (draft?.destinations ?? []).map(d => [
        d.profileKey,
        {customCaption: d.customCaption, customTitle: d.customTitle},
      ]),
    ),
  )

  const launchIssues = validateLaunchContent(type, content)
  const validations = useMemo(
    () =>
      Object.fromEntries(
        selected.map(key => [
          key,
          validateDestination({
            type,
            content,
            destination: overrides[key] ?? {},
            profile: profiles.find(p => p.key === key),
          }),
        ]),
      ),
    [selected, type, content, overrides, profiles],
  )
  const blocked = selected.filter(key => validations[key]?.level === 'blocked')

  const buildLaunch = (): Launch => {
    const now = new Date().toISOString()
    const destinations: LaunchDestination[] = selected.map(key => {
      const existing = draft?.destinations.find(d => d.profileKey === key)
      const profile = profiles.find(p => p.key === key)
      return {
        id: existing?.id ?? TID.nextStr(),
        launchId,
        provider: profile?.provider ?? existing!.provider,
        profileKey: key,
        customCaption: overrides[key]?.customCaption?.trim() || undefined,
        customTitle: overrides[key]?.customTitle?.trim() || undefined,
        status: existing?.status ?? 'pending',
        idempotencyKey: existing?.idempotencyKey ?? TID.nextStr(),
        attempts: existing?.attempts ?? 0,
        updatedAt: now,
      }
    })
    return {
      id: launchId,
      creatorDid: currentAccount?.did ?? '',
      identityGroupId,
      type,
      contentPackage: content,
      destinations,
      publishMode: 'now',
      status: 'draft',
      createdAt: draft?.createdAt ?? now,
      updatedAt: now,
    }
  }

  const onSaveDraft = () => {
    saveLaunch(buildLaunch())
    navigation.dispatch(StackActions.replace('LaunchHub'))
  }

  const onLaunch = () => {
    const launch = buildLaunch()
    saveLaunch(launch)
    navigation.dispatch(StackActions.replace('LaunchDetail', {id: launch.id}))
    runDestinations({
      launch,
      destinationIds: launch.destinations.map(d => d.id),
      profiles,
      ctx: {agent},
      update: fn => updateLaunch(launch.id, fn),
    })
  }

  const selectIdentity = (id: string | undefined) => {
    setIdentityGroupId(id)
    const group = groups.find(g => g.id === id)
    if (group) {
      setSelected(
        group.profileKeys.filter(key => profiles.some(p => p.key === key)),
      )
    }
  }

  return (
    <Layout.Screen testID="newLaunchScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>
            {draft ? 'Editar lançamento' : 'Novo lançamento'}
          </Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content>
        <View style={[a.p_lg, a.gap_lg]}>
          <View style={[a.flex_row, a.gap_xs]}>
            {STEPS.map((label, index) => (
              <Button
                key={label}
                label={`Etapa ${index + 1}: ${label}`}
                size="tiny"
                color={index === step ? 'primary' : 'secondary'}
                variant={index === step ? 'solid' : 'ghost'}
                onPress={() => setStep(index)}>
                <ButtonText>
                  {gtMobile ? `${index + 1}. ${label}` : `${index + 1}`}
                </ButtonText>
              </Button>
            ))}
          </View>

          {step === 0 && (
            <ContentStep
              type={type}
              setType={setType}
              content={content}
              setContent={setContent}
            />
          )}
          {step === 1 && (
            <DestinationsStep
              profiles={profiles}
              selected={selected}
              setSelected={setSelected}
              identityGroupId={identityGroupId}
              onSelectIdentity={selectIdentity}
              groups={groups}
              validations={validations}
            />
          )}
          {step === 2 && (
            <ValidationStep
              type={type}
              content={content}
              profiles={profiles}
              selected={selected}
              validations={validations}
              overrides={overrides}
              setOverrides={setOverrides}
            />
          )}
          {step === 3 && (
            <PublishStep
              type={type}
              content={content}
              selected={selected}
              validations={validations}
            />
          )}

          {step > 0 && launchIssues.length > 0 && (
            <Card>
              {launchIssues.map(issue => (
                <Text
                  key={issue.message}
                  style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {issue.message}
                </Text>
              ))}
            </Card>
          )}

          <View style={[a.flex_row, a.gap_sm, a.justify_between]}>
            <Button
              label="Salvar rascunho"
              size="small"
              color="secondary"
              onPress={onSaveDraft}>
              <ButtonText>Salvar rascunho</ButtonText>
            </Button>
            <View style={[a.flex_row, a.gap_sm]}>
              {step > 0 && (
                <Button
                  label="Voltar"
                  size="small"
                  color="secondary"
                  variant="ghost"
                  onPress={() => setStep(step - 1)}>
                  <ButtonText>Voltar</ButtonText>
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  label="Continuar"
                  size="small"
                  color="primary"
                  onPress={() => setStep(step + 1)}>
                  <ButtonText>Continuar</ButtonText>
                </Button>
              ) : (
                <Button
                  label="Lançar"
                  size="small"
                  color="primary"
                  disabled={
                    !selected.length ||
                    blocked.length > 0 ||
                    launchIssues.length > 0
                  }
                  onPress={onLaunch}>
                  <ButtonText>Lançar</ButtonText>
                </Button>
              )}
            </View>
          </View>
        </View>
      </Layout.Content>
    </Layout.Screen>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <View>
      <TextField.LabelText>{label}</TextField.LabelText>
      <TextField.Root>
        <TextField.Input
          label={label}
          placeholder={placeholder}
          value={value ?? ''}
          onChangeText={onChange}
          multiline={multiline}
          numberOfLines={multiline ? 4 : undefined}
          style={multiline ? {minHeight: 96} : undefined}
        />
      </TextField.Root>
    </View>
  )
}

function ContentStep({
  type,
  setType,
  content,
  setContent,
}: {
  type: LaunchType
  setType: (type: LaunchType) => void
  content: ContentPackage
  setContent: (fn: (content: ContentPackage) => ContentPackage) => void
}) {
  const t = useTheme()
  const images = content.media.filter(m => m.kind === 'image')

  const setField = (field: LaunchTypeField, value: string) =>
    setContent(c => {
      if (field.startsWith('music.')) {
        const key = field.slice('music.'.length) as keyof MusicReleaseMetadata
        return {...c, music: {...c.music, [key]: value}}
      }
      return {...c, [field]: value}
    })

  const onAddImages = async () => {
    const picked = await openPicker({
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    })
    const assets = picked.slice(0, MAX_IMAGES - images.length).map(image =>
      rememberAssetUri(
        {
          id: TID.nextStr(),
          kind: 'image',
          role: 'attachment',
          mime: image.mime,
          width: image.width,
          height: image.height,
          size: image.size,
        },
        image.path,
      ),
    )
    setContent(c => ({...c, media: [...c.media, ...assets]}))
  }

  const updateAsset = (id: string, changes: Partial<MediaAsset>) =>
    setContent(c => ({
      ...c,
      media: c.media.map(m => (m.id === id ? {...m, ...changes} : m)),
    }))

  return (
    <View style={[a.gap_lg]}>
      <View style={[a.gap_sm]}>
        <SectionTitleText>Tipo de lançamento</SectionTitleText>
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          {LAUNCH_TYPES.map(def => (
            <Button
              key={def.type}
              label={def.label}
              size="small"
              color={type === def.type ? 'primary' : 'secondary'}
              onPress={() => setType(def.type)}>
              <ButtonText>{def.label}</ButtonText>
            </Button>
          ))}
        </View>
      </View>

      <Field
        label="Texto de divulgação"
        placeholder="O texto que vai para as redes sociais"
        value={content.text}
        onChange={text => setContent(c => ({...c, text}))}
        multiline
      />

      {getLaunchType(type).fields.map(field =>
        field === 'music.albumOrSingle' ? (
          <View key={field} style={[a.gap_xs]}>
            <TextField.LabelText>{FIELD_LABELS[field]}</TextField.LabelText>
            <View style={[a.flex_row, a.gap_xs]}>
              {(['single', 'ep', 'album'] as const).map(value => (
                <Button
                  key={value}
                  label={value}
                  size="tiny"
                  color={
                    content.music?.albumOrSingle === value
                      ? 'primary'
                      : 'secondary'
                  }
                  onPress={() => setField(field, value)}>
                  <ButtonText>
                    {value === 'single'
                      ? 'Single'
                      : value === 'ep'
                        ? 'EP'
                        : 'Álbum'}
                  </ButtonText>
                </Button>
              ))}
            </View>
          </View>
        ) : (
          <Field
            key={field}
            label={FIELD_LABELS[field]}
            placeholder={
              field === 'music.releaseDate' ? 'AAAA-MM-DD' : undefined
            }
            value={getFieldValue(content, field)}
            onChange={value => setField(field, value)}
            multiline={MULTILINE_FIELDS.includes(field)}
          />
        ),
      )}

      <View style={[a.gap_sm]}>
        <SectionTitleText>Mídia master</SectionTitleText>
        {images.map(image => (
          <View key={image.id} style={[a.flex_row, a.gap_sm, a.align_center]}>
            <Image
              source={{uri: resolveAssetUri(image)}}
              style={[
                a.rounded_sm,
                {width: 64, height: 64},
                t.atoms.bg_contrast_50,
              ]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={[a.flex_1]}>
              <TextField.Root>
                <TextField.Input
                  label="Texto alternativo"
                  placeholder="Descreva a imagem"
                  value={image.alt ?? ''}
                  onChangeText={alt => updateAsset(image.id, {alt})}
                />
              </TextField.Root>
            </View>
            <Button
              label="Remover imagem"
              size="small"
              shape="round"
              color="secondary"
              variant="ghost"
              onPress={() =>
                setContent(c => ({
                  ...c,
                  media: c.media.filter(m => m.id !== image.id),
                }))
              }>
              <ButtonIcon icon={XIcon} />
            </Button>
          </View>
        ))}
        {images.length < MAX_IMAGES && (
          <Button
            label="Adicionar imagem"
            size="small"
            color="secondary"
            style={[a.self_start]}
            onPress={onAddImages}>
            <ButtonIcon icon={ImageIcon} />
            <ButtonText>Adicionar imagem</ButtonText>
          </Button>
        )}
        <NoticeText>
          O arquivo master não é alterado; cada destino recebe a sua variante.
          Envio de vídeo e áudio master ainda não está disponível no Launch Hub.
        </NoticeText>
      </View>
    </View>
  )
}

function DestinationsStep({
  profiles,
  selected,
  setSelected,
  identityGroupId,
  onSelectIdentity,
  groups,
  validations,
}: {
  profiles: ManagedProfile[]
  selected: string[]
  setSelected: (keys: string[]) => void
  identityGroupId: string | undefined
  onSelectIdentity: (id: string | undefined) => void
  groups: {id: string; name: string}[]
  validations: Record<string, ReturnType<typeof validateDestination>>
}) {
  const t = useTheme()

  return (
    <View style={[a.gap_lg]}>
      <View style={[a.gap_sm]}>
        <SectionTitleText>Identidade</SectionTitleText>
        <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
          <Button
            label="Sem identidade"
            size="small"
            color={!identityGroupId ? 'primary' : 'secondary'}
            onPress={() => onSelectIdentity(undefined)}>
            <ButtonText>Sem identidade</ButtonText>
          </Button>
          {groups.map(group => (
            <Button
              key={group.id}
              label={group.name}
              size="small"
              color={identityGroupId === group.id ? 'primary' : 'secondary'}
              onPress={() => onSelectIdentity(group.id)}>
              <ButtonText>{group.name}</ButtonText>
            </Button>
          ))}
        </View>
        {!groups.length && (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Crie identidades na aba Identidades do Launch Hub.
          </Text>
        )}
      </View>

      <Toggle.Group
        label="Destinos"
        type="checkbox"
        values={selected}
        onChange={setSelected}>
        <View style={[a.gap_lg]}>
          {providersByCategory().map(group => (
            <View key={group.category} style={[a.gap_sm]}>
              <SectionTitleText>{group.label}</SectionTitleText>
              {group.providers.map(provider => {
                const own = profiles.filter(p => p.provider === provider.id)
                if (!own.length) {
                  return (
                    <View
                      key={provider.id}
                      style={[
                        a.flex_row,
                        a.align_center,
                        a.gap_sm,
                        {opacity: 0.6},
                      ]}>
                      <ProviderBadge provider={provider.id} size={28} />
                      <Text style={[a.flex_1, a.text_sm]}>{provider.name}</Text>
                      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                        {provider.sameNetworkAs
                          ? `Incluído via ${getProvider(provider.sameNetworkAs).name}`
                          : CONNECTION_LABELS.not_configured}
                      </Text>
                    </View>
                  )
                }
                return own.map(profile => (
                  <Toggle.Item
                    key={profile.key}
                    name={profile.key}
                    label={`${provider.name} — ${profile.displayName}`}>
                    <Toggle.Checkbox />
                    <ProfileAvatar profile={profile} size={28} />
                    <View style={[a.flex_1]}>
                      <Text style={[a.text_sm, a.font_bold]} numberOfLines={1}>
                        {provider.name} —{' '}
                        {profile.handle
                          ? `@${profile.handle}`
                          : profile.displayName}
                      </Text>
                      <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
                        {PROFILE_TYPE_LABELS[profile.type]} ·{' '}
                        {CONNECTION_LABELS[profile.status]}
                      </Text>
                    </View>
                    {validations[profile.key] && (
                      <ValidationPill validation={validations[profile.key]} />
                    )}
                  </Toggle.Item>
                ))
              })}
            </View>
          ))}
        </View>
      </Toggle.Group>
    </View>
  )
}

function ValidationStep({
  type,
  content,
  profiles,
  selected,
  validations,
  overrides,
  setOverrides,
}: {
  type: LaunchType
  content: ContentPackage
  profiles: ManagedProfile[]
  selected: string[]
  validations: Record<string, ReturnType<typeof validateDestination>>
  overrides: Overrides
  setOverrides: (fn: (o: Overrides) => Overrides) => void
}) {
  const t = useTheme()
  const hasTitle = getLaunchType(type).fields.includes('title')

  if (!selected.length) {
    return (
      <NoticeText>Escolha ao menos um destino na etapa anterior.</NoticeText>
    )
  }

  return (
    <View style={[a.gap_md]}>
      {selected.map(key => {
        const profile = profiles.find(p => p.key === key)
        const validation = validations[key]
        const override = overrides[key] ?? {}
        const setOverride = (changes: Partial<typeof override>) =>
          setOverrides(o => ({...o, [key]: {...o[key], ...changes}}))
        const preview = profile
          ? getAdapter(profile.provider).renderPreview({
              type,
              content,
              destination: override,
              profile,
            })
          : null

        return (
          <Card key={key}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              {profile ? <ProfileAvatar profile={profile} size={28} /> : null}
              <Text
                style={[a.flex_1, a.text_sm, a.font_bold]}
                numberOfLines={1}>
                {profile
                  ? `${getProvider(profile.provider).name} — ${
                      profile.handle
                        ? '@' + profile.handle
                        : profile.displayName
                    }`
                  : 'Perfil indisponível'}
              </Text>
              <ValidationPill validation={validation} />
            </View>
            {validation.issues.map(issue => (
              <Text
                key={issue.message}
                style={[
                  a.text_sm,
                  {
                    color:
                      issue.level === 'blocked'
                        ? t.palette.negative_500
                        : '#9a5b00',
                  },
                ]}>
                {issue.level === 'blocked' ? '✕ ' : '⚠ '}
                {issue.message}
              </Text>
            ))}

            <Field
              label="Texto só para este destino"
              placeholder="Usa o texto de divulgação se ficar vazio"
              value={override.customCaption}
              onChange={customCaption => setOverride({customCaption})}
              multiline
            />
            {hasTitle && (
              <Field
                label="Título só para este destino"
                placeholder={content.title}
                value={override.customTitle}
                onChange={customTitle => setOverride({customTitle})}
              />
            )}

            <SectionTitleText>Pré-visualização</SectionTitleText>
            {preview ? (
              <View
                style={[
                  a.rounded_sm,
                  a.p_md,
                  a.gap_sm,
                  t.atoms.bg_contrast_25,
                ]}>
                {preview.title && (
                  <Text style={[a.text_md, a.font_bold]}>{preview.title}</Text>
                )}
                <Text style={[a.text_sm, a.leading_snug]}>
                  {preview.text || '(sem texto)'}
                </Text>
                {preview.media.length > 0 && (
                  <View style={[a.flex_row, a.gap_xs]}>
                    {preview.media.map(m => (
                      <Image
                        key={m.id}
                        source={{uri: resolveAssetUri(m)}}
                        style={[a.rounded_xs, {width: 56, height: 56}]}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                Pré-visualização disponível quando a integração estiver
                configurada.
              </Text>
            )}
          </Card>
        )
      })}
    </View>
  )
}

function PublishStep({
  type,
  content,
  selected,
  validations,
}: {
  type: LaunchType
  content: ContentPackage
  selected: string[]
  validations: Record<string, ReturnType<typeof validateDestination>>
}) {
  const t = useTheme()
  const count = (level: 'ready' | 'warning' | 'blocked') =>
    selected.filter(key => validations[key]?.level === level).length

  return (
    <View style={[a.gap_lg]}>
      <View style={[a.gap_sm]}>
        <SectionTitleText>Quando</SectionTitleText>
        <View style={[a.flex_row, a.gap_xs]}>
          <Button label="Publicar agora" size="small" color="primary">
            <ButtonText>Publicar agora</ButtonText>
          </Button>
          <Button label="Agendar" size="small" color="secondary" disabled>
            <ButtonText>Agendar</ButtonText>
          </Button>
        </View>
        <NoticeText>
          O agendamento roda no servidor (fila e workers), não em um timer do
          navegador. Ele fica disponível quando a API de integração do AQUA
          estiver configurada.
        </NoticeText>
      </View>

      <View style={[a.gap_sm]}>
        <SectionTitleText>Revisão</SectionTitleText>
        <Card>
          <Text style={[a.text_md, a.font_bold]}>
            {content.title?.trim() || content.text.trim() || 'Sem título'}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {getLaunchType(type).label} · {selected.length}{' '}
            {selected.length === 1 ? 'destino' : 'destinos'}
          </Text>
          <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
            <PillText tone="positive">{`${count('ready')} prontos`}</PillText>
            <PillText tone="warning">{`${count('warning')} com atenção`}</PillText>
            <PillText tone="negative">{`${count('blocked')} bloqueados`}</PillText>
          </View>
          {count('blocked') > 0 && (
            <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
              Resolva ou desmarque os destinos bloqueados para lançar.
            </Text>
          )}
        </Card>
      </View>
    </View>
  )
}
