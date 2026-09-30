import {useState} from 'react'
import {TextInput, View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyActorDefs} from '@atproto/api'

import {getPostMedia} from '#/lib/media/experiences'
import {openPicker} from '#/lib/media/picker.shared'
import {type StreamplaceLivestreamView} from '#/lib/streamplace'
import {
  AVAILABLE_SECTION_TYPES,
  type ChannelBlob,
  type ChannelSectionType,
  LANGUAGES,
  LIMITS,
  moveItem,
  newLocalId,
  safeUrl,
  SECTION_LABELS,
  type ViewChannelRecord,
} from '#/lib/view-channel/model'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {useUploadChannelImageMutation} from '#/state/queries/view-channel'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {
  bannerAspect,
  ChannelBanner,
  ChannelView,
} from '#/components/view-channel/ChannelView'

export type Draft = ViewChannelRecord
export type SetDraft = (fn: (d: Draft) => Draft) => void
/** Local previews for blobs uploaded but not yet published. */
export type LocalImages = {banner?: string; watermark?: string}

export function FieldLabelText({children}: {children: React.ReactNode}) {
  return <Text style={[a.text_sm, a.font_bold]}>{children}</Text>
}

export function HintText({children}: {children: React.ReactNode}) {
  const t = useTheme()
  return (
    <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>{children}</Text>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  maxLength?: number
  hint?: string
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>{label}</FieldLabelText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.atoms.text_contrast_low.color}
        multiline={multiline}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityHint={hint ?? ''}
        style={[
          a.border,
          a.rounded_sm,
          a.p_sm,
          a.text_md,
          t.atoms.text,
          t.atoms.border_contrast_low,
          multiline && {minHeight: 96, textAlignVertical: 'top'},
        ]}
      />
      {(hint || maxLength) && (
        <HintText>
          {hint ? `${hint} ` : ''}
          {maxLength ? `${value.length}/${maxLength}` : ''}
        </HintText>
      )}
    </View>
  )
}

export function Chip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string
  selected: boolean
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Button
      label={label}
      size="small"
      variant="solid"
      color={selected ? 'primary' : 'secondary'}
      disabled={disabled}
      accessibilityState={{selected}}
      onPress={onPress}>
      <ButtonText>{label}</ButtonText>
    </Button>
  )
}

function SmallButton({
  label,
  onPress,
  disabled,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Button
      label={label}
      size="tiny"
      variant="ghost"
      color="secondary"
      disabled={disabled}
      onPress={onPress}>
      <ButtonText>{label}</ButtonText>
    </Button>
  )
}

// ------------------------------------------------------------ identity

/** The avatar and handle belong to the AQUA Profile — shown, not copied. */
export function InheritedIdentity({
  profile,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.p_md,
        a.rounded_md,
        t.atoms.bg_contrast_25,
      ]}>
      <UserAvatar type="user" size={56} avatar={profile.avatar} />
      <View style={[a.flex_1, a.gap_2xs]}>
        <Text style={[a.text_md, a.font_bold]}>
          {profile.displayName || profile.handle}
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          @{profile.handle}
        </Text>
        <HintText>
          Avatar, handle e inscritos vêm do seu perfil AQUA. Para trocar o
          avatar, edite o perfil.
        </HintText>
      </View>
      <Link to={`/profile/${profile.handle}`} label="Editar perfil AQUA">
        <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
          Editar perfil →
        </Text>
      </Link>
    </View>
  )
}

export function HandleReadOnly({handle}: {handle: string}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>Handle / URL</FieldLabelText>
      <View
        style={[a.p_sm, a.rounded_sm, a.border, t.atoms.border_contrast_low]}>
        <Text style={[a.text_md]}>/views/channel/{handle}</Text>
      </View>
      <HintText>
        O handle do canal é o seu handle AQUA — um só nome, sem outro cadastro.
        Para mudá-lo, altere o handle da conta.
      </HintText>
      <Link to="/settings/account" label="Alterar handle da conta">
        <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_high]}>
          Alterar handle da conta →
        </Text>
      </Link>
    </View>
  )
}

// ------------------------------------------------------------ images

function useImageUpload(
  onUploaded: (blob: ChannelBlob, local: string) => void,
) {
  const upload = useUploadChannelImageMutation()
  const [error, setError] = useState<string>()
  const pick = async () => {
    setError(undefined)
    try {
      const [image] = await openPicker({selectionLimit: 1})
      if (!image) return
      const r = await upload.mutateAsync(image)
      onUploaded(r.blob, r.localUri)
    } catch {
      setError('Não foi possível enviar a imagem.')
    }
  }
  return {pick, busy: upload.isPending, error}
}

export function BannerEditor({
  draft,
  setDraft,
  bannerUri,
  setLocal,
}: {
  draft: Draft
  setDraft: SetDraft
  bannerUri?: string
  setLocal: (fn: (l: LocalImages) => LocalImages) => void
}) {
  const t = useTheme()
  const {pick, busy, error} = useImageUpload((blob, local) => {
    setDraft(d => ({...d, banner: blob, bannerFocusY: 50}))
    setLocal(l => ({...l, banner: local}))
  })
  const focus = draft.bannerFocusY ?? 50
  const setFocus = (y: number) =>
    setDraft(d => ({...d, bannerFocusY: Math.min(100, Math.max(0, y))}))
  return (
    <View style={[a.gap_sm]}>
      <FieldLabelText>Banner</FieldLabelText>
      <HintText>
        Específico do View. Recomendado 2560 × 1440 px; o centro aparece em
        todas as telas.
      </HintText>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Button
          label={draft.banner ? 'Trocar banner' : 'Enviar banner'}
          size="small"
          color="secondary"
          disabled={busy}
          onPress={pick}>
          <ButtonText>
            {busy
              ? 'Enviando…'
              : draft.banner
                ? 'Trocar banner'
                : 'Enviar banner'}
          </ButtonText>
        </Button>
        {draft.banner && (
          <SmallButton
            label="Remover banner"
            onPress={() => {
              setDraft(d => ({...d, banner: undefined}))
              setLocal(l => ({...l, banner: undefined}))
            }}
          />
        )}
      </View>
      {error && <Text style={[a.text_sm, {color: '#d6336c'}]}>{error}</Text>}
      {draft.banner && (
        <>
          <FieldLabelText>Posição do recorte</FieldLabelText>
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs, a.align_center]}>
            <Chip
              label="Topo"
              selected={focus === 0}
              onPress={() => setFocus(0)}
            />
            <Chip
              label="Centro"
              selected={focus === 50}
              onPress={() => setFocus(50)}
            />
            <Chip
              label="Base"
              selected={focus === 100}
              onPress={() => setFocus(100)}
            />
            <SmallButton label="Subir" onPress={() => setFocus(focus - 10)} />
            <SmallButton label="Descer" onPress={() => setFocus(focus + 10)} />
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              {focus}%
            </Text>
          </View>
          <FieldLabelText>Prévia responsiva</FieldLabelText>
          {(
            [
              ['Desktop', 4, '100%'],
              ['Tablet', 2, '75%'],
              ['Celular', 1, '45%'],
            ] as const
          ).map(([label, columns, width]) => (
            <View key={label} style={[a.gap_2xs, {width}]}>
              <HintText>{label}</HintText>
              <View style={[a.rounded_sm, a.overflow_hidden]}>
                <ChannelBanner
                  uri={bannerUri}
                  focusY={focus}
                  aspect={bannerAspect(columns)}
                />
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

export function WatermarkEditor({
  draft,
  setDraft,
  watermarkUri,
  setLocal,
}: {
  draft: Draft
  setDraft: SetDraft
  watermarkUri?: string
  setLocal: (fn: (l: LocalImages) => LocalImages) => void
}) {
  const t = useTheme()
  const {pick, busy, error} = useImageUpload((blob, local) => {
    setDraft(d => ({...d, watermark: blob}))
    setLocal(l => ({...l, watermark: local}))
  })
  return (
    <View style={[a.gap_sm]}>
      <FieldLabelText>Marca d'água dos vídeos</FieldLabelText>
      <HintText>
        Aplicada por cima do player (nunca gravada no arquivo do vídeo).
        Recomendado: PNG quadrado com fundo transparente, 150 × 150 px.
      </HintText>
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.align_center]}>
        {watermarkUri && (
          <View
            style={[
              a.rounded_sm,
              a.p_xs,
              t.atoms.bg_contrast_50,
              {width: 56, height: 56},
            ]}>
            <Image
              source={{uri: watermarkUri}}
              style={{width: '100%', height: '100%'}}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel="Marca d'água atual"
              accessibilityHint=""
            />
          </View>
        )}
        <Button
          label={
            draft.watermark ? 'Trocar marca d’água' : 'Enviar marca d’água'
          }
          size="small"
          color="secondary"
          disabled={busy}
          onPress={pick}>
          <ButtonText>
            {busy
              ? 'Enviando…'
              : draft.watermark
                ? 'Trocar'
                : 'Enviar marca d’água'}
          </ButtonText>
        </Button>
        {draft.watermark && (
          <SmallButton
            label="Remover"
            onPress={() => {
              setDraft(d => ({...d, watermark: undefined}))
              setLocal(l => ({...l, watermark: undefined}))
            }}
          />
        )}
      </View>
      {error && <Text style={[a.text_sm, {color: '#d6336c'}]}>{error}</Text>}
    </View>
  )
}

// ------------------------------------------------------------ preferences

export function LanguagePicker({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: SetDraft
}) {
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>Idioma padrão</FieldLabelText>
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        {LANGUAGES.map(l => (
          <Chip
            key={l.code}
            label={l.label}
            selected={draft.defaultLanguage === l.code}
            onPress={() => setDraft(d => ({...d, defaultLanguage: l.code}))}
          />
        ))}
      </View>
    </View>
  )
}

export function TopicsField({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: SetDraft
}) {
  const [text, setText] = useState('')
  const topics = draft.topics ?? []
  const add = () => {
    const value = text.trim().replace(/^#/, '').slice(0, LIMITS.topic)
    if (!value || topics.includes(value) || topics.length >= LIMITS.topics)
      return
    setDraft(d => ({...d, topics: [...(d.topics ?? []), value]}))
    setText('')
  }
  return (
    <View style={[a.gap_xs]}>
      <Field
        label="Tópicos / categorias"
        value={text}
        onChange={setText}
        placeholder="ex.: música, games, tutoriais"
        hint={`Até ${LIMITS.topics}. Toque em Adicionar.`}
      />
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs, a.align_center]}>
        <SmallButton label="Adicionar" onPress={add} />
        {topics.map(topic => (
          <Chip
            key={topic}
            label={`${topic} ✕`}
            selected
            onPress={() =>
              setDraft(d => ({
                ...d,
                topics: (d.topics ?? []).filter(x => x !== topic),
              }))
            }
          />
        ))}
      </View>
    </View>
  )
}

export function VisibilityPicker({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: SetDraft
}) {
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>Visibilidade</FieldLabelText>
      <View style={[a.flex_row, a.gap_xs]}>
        <Chip
          label="Público"
          selected={draft.visibility === 'public'}
          onPress={() => setDraft(d => ({...d, visibility: 'public'}))}
        />
        <Chip
          label="Privado"
          selected={draft.visibility === 'private'}
          onPress={() => setDraft(d => ({...d, visibility: 'private'}))}
        />
      </View>
      <HintText>
        Privado esconde o canal das outras pessoas no AQUA. Os dados do canal
        ficam no seu repositório AT, que é público por natureza — não coloque
        nada sigiloso aqui.
      </HintText>
    </View>
  )
}

// ------------------------------------------------------------ links

export function LinksEditor({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: SetDraft
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const links = [...draft.links].sort((x, y) => x.position - y.position)
  const add = () => {
    const clean = safeUrl(url)
    if (!label.trim() || !clean)
      return setError('Informe um nome e um link https válido.')
    if (links.length >= LIMITS.links)
      return setError(`Máximo de ${LIMITS.links} links.`)
    setError(undefined)
    setDraft(d => ({
      ...d,
      links: [
        ...d.links,
        {
          id: newLocalId('lnk'),
          label: label.trim().slice(0, LIMITS.linkLabel),
          url: clean,
          position: d.links.length,
        },
      ],
    }))
    setLabel('')
    setUrl('')
  }
  return (
    <View style={[a.gap_sm]}>
      <FieldLabelText>Links</FieldLabelText>
      {links.map((l, i) => (
        <View
          key={l.id}
          style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
          <Text style={[a.text_sm, a.flex_1]} numberOfLines={1}>
            {l.label} — {l.url}
          </Text>
          <SmallButton
            label="Subir"
            disabled={i === 0}
            onPress={() =>
              setDraft(d => ({...d, links: moveItem(d.links, i, -1)}))
            }
          />
          <SmallButton
            label="Descer"
            disabled={i === links.length - 1}
            onPress={() =>
              setDraft(d => ({...d, links: moveItem(d.links, i, 1)}))
            }
          />
          <SmallButton
            label="Remover"
            onPress={() =>
              setDraft(d => ({
                ...d,
                links: d.links
                  .filter(x => x.id !== l.id)
                  .map((x, position) => ({...x, position})),
              }))
            }
          />
        </View>
      ))}
      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        <View style={[a.flex_1, {minWidth: 140}]}>
          <Field
            label="Nome"
            value={label}
            onChange={setLabel}
            placeholder="Website"
            maxLength={LIMITS.linkLabel}
          />
        </View>
        <View style={[a.flex_1, {minWidth: 180}]}>
          <Field
            label="Link"
            value={url}
            onChange={setUrl}
            placeholder="https://…"
          />
        </View>
      </View>
      {error && <Text style={[a.text_sm, {color: '#d6336c'}]}>{error}</Text>}
      <View style={[a.flex_row]}>
        <Button
          label="Adicionar link"
          size="small"
          color="secondary"
          onPress={add}>
          <ButtonText>Adicionar link</ButtonText>
        </Button>
      </View>
    </View>
  )
}

// ------------------------------------------------------------ layout

/** Picks one of the channel's own videos by reference (never a copy). */
export function VideoPicker({
  label,
  hint,
  videos,
  value,
  onChange,
}: {
  label: string
  hint: string
  videos: FeedPostSliceItem[]
  value?: string
  onChange: (uri: string | undefined) => void
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_xs]}>
      <FieldLabelText>{label}</FieldLabelText>
      <HintText>{hint}</HintText>
      {!videos.length && (
        <HintText>Publique um vídeo para poder escolher.</HintText>
      )}
      <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
        <Chip
          label="Nenhum"
          selected={!value}
          onPress={() => onChange(undefined)}
        />
        {videos.slice(0, 24).map(item => {
          const media = getPostMedia(item.post)
          const thumb =
            media.type === 'video' ? media.view.thumbnail : undefined
          const text =
            (item.post.record as {text?: string}).text?.split('\n')[0] ||
            'Vídeo sem título'
          const selected = value === item.uri
          return (
            <Button
              key={item.uri}
              label={`Escolher ${text}`}
              size="small"
              variant="ghost"
              color="secondary"
              accessibilityState={{selected}}
              onPress={() => onChange(item.uri)}
              style={[
                a.p_xs,
                a.rounded_sm,
                a.border,
                selected
                  ? {borderColor: '#0b5cff', borderWidth: 2}
                  : t.atoms.border_contrast_low,
                {width: 150},
              ]}>
              <View style={[a.gap_2xs, a.w_full]}>
                <View
                  style={[
                    a.w_full,
                    a.rounded_xs,
                    a.overflow_hidden,
                    t.atoms.bg_contrast_50,
                    {aspectRatio: 16 / 9},
                  ]}>
                  {thumb && (
                    <Image
                      source={{uri: thumb}}
                      style={{width: '100%', height: '100%'}}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  )}
                </View>
                <Text style={[a.text_xs]} numberOfLines={2}>
                  {text}
                </Text>
              </View>
            </Button>
          )
        })}
      </View>
    </View>
  )
}

export function SectionsEditor({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: SetDraft
}) {
  const t = useTheme()
  const sections = [...draft.sections].sort((x, y) => x.position - y.position)
  const add = (type: ChannelSectionType) =>
    setDraft(d => ({
      ...d,
      sections: [
        ...d.sections,
        {
          id: newLocalId('sec'),
          type,
          position: d.sections.length,
          visibility: 'visible',
        },
      ],
    }))
  const update = (id: string, patch: Partial<Draft['sections'][number]>) =>
    setDraft(d => ({
      ...d,
      sections: d.sections.map(s => (s.id === id ? {...s, ...patch} : s)),
    }))
  return (
    <View style={[a.gap_sm]}>
      <FieldLabelText>Seções da página inicial</FieldLabelText>
      <HintText>
        A ordem aqui é a ordem na Home do canal. Seções ocultas ficam salvas,
        mas não aparecem.
      </HintText>
      {sections.map((s, i) => (
        <View
          key={s.id}
          style={[
            a.p_sm,
            a.gap_xs,
            a.rounded_sm,
            a.border,
            t.atoms.border_contrast_low,
            s.visibility === 'hidden' && {opacity: 0.6},
          ]}>
          <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
            <Text style={[a.text_sm, a.font_bold, a.flex_1]}>
              {i + 1}. {s.title || SECTION_LABELS[s.type]}
              {!AVAILABLE_SECTION_TYPES.includes(s.type)
                ? ' (ainda sem conteúdo no View)'
                : ''}
            </Text>
            <SmallButton
              label="Subir"
              disabled={i === 0}
              onPress={() =>
                setDraft(d => ({...d, sections: moveItem(d.sections, i, -1)}))
              }
            />
            <SmallButton
              label="Descer"
              disabled={i === sections.length - 1}
              onPress={() =>
                setDraft(d => ({...d, sections: moveItem(d.sections, i, 1)}))
              }
            />
            <SmallButton
              label={s.visibility === 'hidden' ? 'Mostrar' : 'Ocultar'}
              onPress={() =>
                update(s.id, {
                  visibility: s.visibility === 'hidden' ? 'visible' : 'hidden',
                })
              }
            />
            <SmallButton
              label="Remover"
              onPress={() =>
                setDraft(d => ({
                  ...d,
                  sections: d.sections
                    .filter(x => x.id !== s.id)
                    .map((x, position) => ({...x, position})),
                }))
              }
            />
          </View>
          <TextInput
            value={s.title ?? ''}
            onChangeText={title =>
              update(s.id, {
                title: title.slice(0, LIMITS.sectionTitle) || undefined,
              })
            }
            placeholder={`Título (padrão: ${SECTION_LABELS[s.type]})`}
            placeholderTextColor={t.atoms.text_contrast_low.color}
            accessibilityLabel="Título da seção"
            accessibilityHint=""
            style={[
              a.border,
              a.rounded_sm,
              a.px_sm,
              a.py_xs,
              a.text_sm,
              t.atoms.text,
              t.atoms.border_contrast_low,
            ]}
          />
        </View>
      ))}
      {sections.length < LIMITS.sections && (
        <>
          <FieldLabelText>Adicionar seção</FieldLabelText>
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            {(Object.keys(SECTION_LABELS) as ChannelSectionType[]).map(type => (
              <Chip
                key={type}
                label={`+ ${SECTION_LABELS[type]}${AVAILABLE_SECTION_TYPES.includes(type) ? '' : ' (em breve)'}`}
                selected={false}
                onPress={() => add(type)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  )
}

// ------------------------------------------------------------ preview

type Device = 'desktop' | 'tablet' | 'mobile'
const DEVICES: Record<Device, {label: string; columns: number; width: number}> =
  {
    desktop: {label: 'Desktop', columns: 4, width: 1100},
    tablet: {label: 'Tablet', columns: 2, width: 720},
    mobile: {label: 'Celular', columns: 1, width: 380},
  }

/** Live preview of unpublished edits, at desktop/tablet/phone widths. */
export function ChannelPreview({
  profile,
  draft,
  bannerUri,
  watermarkUri,
  videos,
  drops,
  live,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed
  draft: Draft
  bannerUri?: string
  watermarkUri?: string
  videos: FeedPostSliceItem[]
  drops: FeedPostSliceItem[]
  live?: StreamplaceLivestreamView
}) {
  const t = useTheme()
  const [device, setDevice] = useState<Device>('desktop')
  const d = DEVICES[device]
  const find = (uri?: string) =>
    videos.concat(drops).find(v => v.uri === uri)?.post
  return (
    <View style={[a.gap_sm]}>
      <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
        <FieldLabelText>Prévia</FieldLabelText>
        {(Object.keys(DEVICES) as Device[]).map(key => (
          <Chip
            key={key}
            label={DEVICES[key].label}
            selected={device === key}
            onPress={() => setDevice(key)}
          />
        ))}
      </View>
      <View
        style={[
          a.rounded_md,
          a.overflow_hidden,
          a.border,
          t.atoms.border_contrast_low,
          t.atoms.bg,
          {width: '100%', maxWidth: d.width, alignSelf: 'center'},
        ]}>
        <ChannelView
          key={device}
          profile={profile}
          channel={draft}
          bannerUri={bannerUri}
          watermarkUri={watermarkUri}
          videos={videos}
          drops={drops}
          live={live}
          trailer={find(draft.trailerUri)}
          featured={find(draft.featuredUri)}
          isOwner
          preview={{columns: d.columns}}
        />
      </View>
    </View>
  )
}
