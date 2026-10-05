import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  PanResponder,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {openPicker, type PickerImage} from '#/lib/media/picker.shared'
import {type NavigationProp} from '#/lib/routes/types'
import {
  OVERLAY_LIMITS,
  STICKERS,
  STORY_BACKGROUNDS,
  type StoryOverlay,
  TEXT_COLORS,
  validateStoryDraft,
} from '#/lib/stories/model'
import {logger} from '#/logger'
import {useCreateStoryMutation} from '#/state/queries/stories'
import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {OverlayView, StoryFrame} from '#/components/stories/StoryFrame'
import {Text} from '#/components/Typography'

type Mode = 'choose' | 'photo' | 'text'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const STEP = 0.25

/**
 * Story creator. Compose on the same 9:16 canvas viewers see: a photo or a
 * colour, plus draggable text and emoji. Overlays are saved in the record
 * (not baked into the image), so they stay crisp and editable-by-data.
 */
export function StoryCreatorScreen() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {width: winW, height: winH} = useWindowDimensions()
  const {mutateAsync: publish, isPending} = useCreateStoryMutation()

  const [mode, setMode] = useState<Mode>('choose')
  const [image, setImage] = useState<PickerImage>()
  const [background, setBackground] = useState(STORY_BACKGROUNDS[0])
  const [overlays, setOverlays] = useState<StoryOverlay[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [stickersOpen, setStickersOpen] = useState(false)
  const [editing, setEditing] = useState<
    {id?: string; text: string; color: string; pill: boolean} | undefined
  >()
  const nextId = useRef(0)

  const canvasW = Math.max(
    180,
    Math.min(winW - 32, (winH - 330) * (9 / 16), 380),
  )
  const selected = overlays.find(o => o.id === selectedId)

  const pickPhoto = useCallback(async () => {
    try {
      const [picked] = await openPicker({selectionLimit: 1})
      if (!picked) return false
      setImage(picked)
      setMode('photo')
      return true
    } catch (e: any) {
      logger.error('Story photo pick failed', {message: String(e)})
      Toast.show('Não foi possível abrir a galeria', 'error')
      return false
    }
  }, [])

  const patch = useCallback(
    (id: string, change: Partial<StoryOverlay>) =>
      setOverlays(list => list.map(o => (o.id === id ? {...o, ...change} : o))),
    [],
  )
  const move = useCallback(
    (id: string, x: number, y: number) => patch(id, {x, y}),
    [patch],
  )

  const addOverlay = (o: Omit<StoryOverlay, 'id'>) => {
    if (overlays.length >= OVERLAY_LIMITS.items) {
      Toast.show(`No máximo ${OVERLAY_LIMITS.items} itens por story`, 'error')
      return
    }
    const id = `o${Date.now().toString(36)}${nextId.current++}`
    setOverlays(list => [...list, {...o, id}])
    setSelectedId(id)
  }

  const commitText = () => {
    if (!editing) return
    const text = editing.text.trim()
    if (!text) {
      setEditing(undefined)
      return
    }
    if (editing.id) {
      patch(editing.id, {text, color: editing.color, pill: editing.pill})
    } else {
      addOverlay({
        kind: 'text',
        text,
        x: 0.5,
        y: 0.5,
        scale: 1,
        color: editing.color,
        pill: editing.pill,
      })
    }
    setEditing(undefined)
  }

  const remove = () => {
    if (!selectedId) return
    setOverlays(list => list.filter(o => o.id !== selectedId))
    setSelectedId(undefined)
  }

  const invalid = validateStoryDraft({
    hasMedia: mode === 'photo' && !!image,
    background: mode === 'text' ? background : undefined,
    overlays,
  })

  const onPublish = async () => {
    try {
      await publish({
        image: mode === 'photo' ? image : undefined,
        background: mode === 'text' ? background : undefined,
        overlays,
      })
      Toast.show('Story publicado')
      navigation.goBack()
    } catch (e: any) {
      logger.error('Failed to create story', {message: String(e)})
      Toast.show('Não foi possível publicar o story', 'error')
    }
  }

  const story = useMemo(
    () => ({
      mediaUrl: mode === 'photo' ? image?.path : undefined,
      background: mode === 'text' ? background : '#000000',
      fit: 'cover' as const,
      overlays,
    }),
    [mode, image, background, overlays],
  )

  return (
    <Layout.Screen testID="storyCreateScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>Novo story</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.KeyboardAwareContent>
        <View style={[a.align_center, a.gap_lg, a.px_lg, a.py_lg]}>
          {mode === 'choose' ? (
            <Chooser
              onPhoto={pickPhoto}
              onText={() => setMode('text')}
            />
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Área do story. Toque para desselecionar"
                accessibilityHint=""
                onPress={() => setSelectedId(undefined)}>
                <View style={[a.rounded_lg, a.overflow_hidden]}>
                  <StoryFrame
                    story={story}
                    width={canvasW}
                    renderOverlay={(o, w, h) => (
                      <DraggableOverlay
                        key={o.id}
                        overlay={o}
                        width={w}
                        height={h}
                        selected={o.id === selectedId}
                        onSelect={setSelectedId}
                        onMove={move}
                      />
                    )}
                  />
                </View>
              </Pressable>

              {editing ? (
                <TextEditor
                  value={editing}
                  onChange={setEditing}
                  onDone={commitText}
                  onCancel={() => setEditing(undefined)}
                />
              ) : (
                <View style={[a.gap_md, a.align_center, {maxWidth: 420}]}>
                  <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.justify_center]}>
                    <Button
                      label="Adicionar texto"
                      size="small"
                      color="secondary"
                      onPress={() =>
                        setEditing({text: '', color: '#FFFFFF', pill: false})
                      }>
                      <ButtonText>Aa Texto</ButtonText>
                    </Button>
                    <Button
                      label="Adicionar figurinha"
                      size="small"
                      color={stickersOpen ? 'primary' : 'secondary'}
                      onPress={() => setStickersOpen(v => !v)}>
                      <ButtonText>Figurinha</ButtonText>
                    </Button>
                    {mode === 'photo' ? (
                      <Button
                        label="Trocar foto"
                        size="small"
                        color="secondary"
                        onPress={pickPhoto}>
                        <ButtonText>Trocar foto</ButtonText>
                      </Button>
                    ) : null}
                  </View>

                  {mode === 'text' && (
                    <Swatches
                      label="Cor de fundo"
                      colors={STORY_BACKGROUNDS}
                      value={background}
                      onPick={setBackground}
                    />
                  )}

                  {stickersOpen && (
                    <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.justify_center]}>
                      {STICKERS.map(emoji => (
                        <Pressable
                          key={emoji}
                          accessibilityRole="button"
                          accessibilityLabel={`Adicionar ${emoji}`}
                          accessibilityHint=""
                          onPress={() =>
                            addOverlay({
                              kind: 'sticker',
                              text: emoji,
                              x: 0.5,
                              y: 0.5,
                              scale: 1,
                              color: '#FFFFFF',
                            })
                          }>
                          <Text style={[a.text_3xl]}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {selected && (
                    <View
                      style={[
                        a.gap_sm,
                        a.align_center,
                        a.p_md,
                        a.rounded_md,
                        a.border,
                        t.atoms.border_contrast_low,
                      ]}>
                      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                        Arraste na imagem para mover
                      </Text>
                      <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.justify_center]}>
                        <Button
                          label="Diminuir"
                          size="small"
                          color="secondary"
                          disabled={selected.scale <= OVERLAY_LIMITS.scaleMin}
                          onPress={() =>
                            patch(selected.id, {
                              scale: Math.max(
                                OVERLAY_LIMITS.scaleMin,
                                selected.scale - STEP,
                              ),
                            })
                          }>
                          <ButtonText>A−</ButtonText>
                        </Button>
                        <Button
                          label="Aumentar"
                          size="small"
                          color="secondary"
                          disabled={selected.scale >= OVERLAY_LIMITS.scaleMax}
                          onPress={() =>
                            patch(selected.id, {
                              scale: Math.min(
                                OVERLAY_LIMITS.scaleMax,
                                selected.scale + STEP,
                              ),
                            })
                          }>
                          <ButtonText>A+</ButtonText>
                        </Button>
                        {selected.kind === 'text' && (
                          <Button
                            label="Editar texto"
                            size="small"
                            color="secondary"
                            onPress={() =>
                              setEditing({
                                id: selected.id,
                                text: selected.text,
                                color: selected.color,
                                pill: !!selected.pill,
                              })
                            }>
                            <ButtonText>Editar</ButtonText>
                          </Button>
                        )}
                        <Button
                          label="Excluir item"
                          size="small"
                          color="negative_subtle"
                          onPress={remove}>
                          <ButtonText>Excluir</ButtonText>
                        </Button>
                      </View>
                      {selected.kind === 'text' && (
                        <Swatches
                          label="Cor do texto"
                          colors={TEXT_COLORS}
                          value={selected.color}
                          onPick={c => patch(selected.id, {color: c})}
                        />
                      )}
                    </View>
                  )}

                  <View style={[a.flex_row, a.gap_sm]}>
                    <Button
                      label="Recomeçar"
                      size="large"
                      color="secondary"
                      disabled={isPending}
                      onPress={() => {
                        setMode('choose')
                        setImage(undefined)
                        setOverlays([])
                        setSelectedId(undefined)
                      }}>
                      <ButtonText>Recomeçar</ButtonText>
                    </Button>
                    <Button
                      label="Publicar story"
                      size="large"
                      color="primary"
                      disabled={!!invalid || isPending}
                      onPress={onPublish}>
                      <ButtonText>
                        {isPending ? 'Publicando…' : 'Publicar'}
                      </ButtonText>
                    </Button>
                  </View>
                  {invalid && (
                    <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                      {mode === 'text'
                        ? 'Adicione um texto ou figurinha para publicar.'
                        : 'Escolha uma foto para publicar.'}
                    </Text>
                  )}
                  <Text style={[a.text_xs, t.atoms.text_contrast_medium, a.text_center]}>
                    Some em 24 horas. Para guardar, adicione a um destaque no seu perfil.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </Layout.KeyboardAwareContent>
    </Layout.Screen>
  )
}

function Chooser({
  onPhoto,
  onText,
}: {
  onPhoto: () => void
  onText: () => void
}) {
  const t = useTheme()
  const card = [
    a.p_xl,
    a.gap_xs,
    a.align_center,
    a.rounded_lg,
    a.border,
    t.atoms.border_contrast_low,
    t.atoms.bg_contrast_25,
    {width: 220},
  ]
  return (
    <View style={[a.align_center, a.gap_lg, {paddingTop: 24}]}>
      <Text style={[a.text_2xl, a.font_bold, a.text_center]}>
        Criar story
      </Text>
      <View style={[a.flex_row, a.flex_wrap, a.gap_md, a.justify_center]}>
        <Button label="Criar story com foto" onPress={onPhoto} style={card}>
          <Text style={[a.text_3xl]}>🖼️</Text>
          <Text style={[a.text_lg, a.font_bold]}>Foto</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.text_center]}>
            Escolha da galeria e adicione texto e figurinhas
          </Text>
        </Button>
        <Button label="Criar story só com texto" onPress={onText} style={card}>
          <Text style={[a.text_3xl]}>Aa</Text>
          <Text style={[a.text_lg, a.font_bold]}>Texto</Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.text_center]}>
            Fundo colorido com sua mensagem
          </Text>
        </Button>
      </View>
    </View>
  )
}

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string
  colors: string[]
  value: string
  onPick: (c: string) => void
}) {
  const t = useTheme()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[a.flex_row, a.gap_sm, a.align_center]}>
      {colors.map(c => (
        <Pressable
          key={c}
          accessibilityRole="radio"
          accessibilityState={{selected: c === value}}
          accessibilityLabel={`${label} ${c}`}
          accessibilityHint=""
          onPress={() => onPick(c)}
          style={[
            a.rounded_full,
            {
              width: 28,
              height: 28,
              backgroundColor: c,
              borderWidth: c === value ? 3 : 1,
              borderColor:
                c === value
                  ? t.palette.primary_500
                  : t.atoms.border_contrast_low.borderColor,
            },
          ]}
        />
      ))}
    </View>
  )
}

function TextEditor({
  value,
  onChange,
  onDone,
  onCancel,
}: {
  value: {id?: string; text: string; color: string; pill: boolean}
  onChange: (v: {id?: string; text: string; color: string; pill: boolean}) => void
  onDone: () => void
  onCancel: () => void
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_md, a.align_center, {width: '100%', maxWidth: 420}]}>
      <TextInput
        autoFocus
        multiline
        value={value.text}
        onChangeText={text => onChange({...value, text})}
        maxLength={OVERLAY_LIMITS.text}
        placeholder="Digite seu texto"
        placeholderTextColor={t.atoms.text_contrast_low.color}
        accessibilityLabel="Texto do story"
        accessibilityHint=""
        style={[
          a.w_full,
          a.p_md,
          a.rounded_md,
          a.border,
          a.text_lg,
          t.atoms.text,
          t.atoms.border_contrast_low,
          t.atoms.bg_contrast_25,
          {minHeight: 80},
        ]}
      />
      <Swatches
        label="Cor do texto"
        colors={TEXT_COLORS}
        value={value.color}
        onPick={color => onChange({...value, color})}
      />
      <View style={[a.flex_row, a.gap_sm]}>
        <Button
          label={value.pill ? 'Remover destaque do texto' : 'Texto com fundo'}
          size="small"
          color={value.pill ? 'primary' : 'secondary'}
          onPress={() => onChange({...value, pill: !value.pill})}>
          <ButtonText>Com fundo</ButtonText>
        </Button>
        <Button label="Cancelar" size="small" color="secondary" onPress={onCancel}>
          <ButtonText>Cancelar</ButtonText>
        </Button>
        <Button
          label="Concluir texto"
          size="small"
          color="primary"
          disabled={!value.text.trim()}
          onPress={onDone}>
          <ButtonText>Concluir</ButtonText>
        </Button>
      </View>
    </View>
  )
}

function DraggableOverlay({
  overlay,
  width,
  height,
  selected,
  onSelect,
  onMove,
}: {
  overlay: StoryOverlay
  width: number
  height: number
  selected: boolean
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const start = useRef({x: overlay.x, y: overlay.y})
  const latest = useRef(overlay)
  useEffect(() => {
    latest.current = overlay
  }, [overlay])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = {x: latest.current.x, y: latest.current.y}
          onSelect(latest.current.id)
        },
        onPanResponderMove: (_, g) =>
          onMove(
            latest.current.id,
            clamp01(start.current.x + g.dx / width),
            clamp01(start.current.y + g.dy / height),
          ),
      }),
    [width, height, onSelect, onMove],
  )

  return (
    <OverlayView overlay={overlay} width={width} height={height} selected={selected}>
      {box => (
        <View
          {...pan.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${overlay.kind === 'text' ? 'Texto' : 'Figurinha'}: ${overlay.text}. Arraste para mover`}>
          {box}
        </View>
      )}
    </OverlayView>
  )
}
