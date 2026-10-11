import {createElement, useMemo, useState} from 'react'
import {Pressable, useWindowDimensions, View} from 'react-native'
import {Image} from 'expo-image'
import {useNavigation} from '@react-navigation/native'

import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {
  HIDDEN_HINT,
  movePinStep,
  orderedPins,
  type StoredPin,
  VISIBILITY_LABEL,
} from '#/lib/visionboard/boards'
import {
  BOARD_FONTS,
  BOARD_FRAMES,
  BOARD_LAYOUTS,
  BOARD_THEMES,
  type BoardFont,
  type BoardFrame,
  type BoardLayout,
  type BoardTheme,
  musicEmbed,
  resolveLook,
} from '#/lib/visionboard/look'
import {gridColumnCount} from '#/lib/visionboard/masonry'
import {type PinImage, pinImage} from '#/lib/visionboard/pin-image'
import {fileToPickerImage} from '#/lib/visionboard/prepare-image'
import {
  selectDroppedFiles,
  type StoredUpload,
  uploadBlobUrl,
} from '#/lib/visionboard/uploads'
import {isWeb} from '#/platform/detection'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useResolveDidQuery} from '#/state/queries/resolve-uri'
import {
  type StoredBoard,
  useBoardQuery,
  useBoardsQuery,
  useDeleteBoardMutation,
  useMovePinMutation,
  usePdsEndpointQuery,
  usePinPostsQuery,
  usePinsByBoardQuery,
  useRemovePinMutation,
  useRemoveUploadMutation,
  useReorderPinsMutation,
  useSaveBoardMutation,
  useUploadImagesMutation,
  useUploadsByBoardQuery,
} from '#/state/queries/visionboard-boards'
import {useSession} from '#/state/session'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Loader} from '#/components/Loader'
import * as Menu from '#/components/Menu'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {
  type DroppedFile,
  ImageDropZone,
} from '#/components/visionboard/ImageDropZone'
import {Capsule} from '#/components/visionboard/VisionboardCapsule'
import {VisionboardTopBar} from '#/components/visionboard/VisionboardTopBar'

const TILT = [-3, 2.5, -1.5, 3.5]
const DROP = [8, 36, 0, 20]
const TILE_WIDTH = 230

/** A single Visionboard: its own background, font, frames and music. */
export function VisionboardBoardViewScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'VisionboardBoardView'>) {
  const navigation = useNavigation<NavigationProp>()
  const [search, setSearch] = useState('')
  const {name, rkey} = route.params
  const did = useResolveDidQuery(name)
  const board = useBoardQuery(did.data || undefined, rkey)
  const pins = usePinsByBoardQuery(did.data || undefined)
  const uploads = useUploadsByBoardQuery(did.data || undefined)
  const pds = usePdsEndpointQuery(did.data || undefined)

  return (
    <Layout.Screen testID="visionboard-board-view" hideCenterBorders>
      <VisionboardTopBar
        tabs={[]}
        activeTab={''}
        onSelectTab={() => {}}
        search={search}
        onChangeSearch={setSearch}
        onSubmitSearch={() =>
          search.trim() && navigation.navigate('Images', {q: search.trim()})
        }
        onClearSearch={() => setSearch('')}
      />
      <View style={[a.w_full, a.px_lg, {paddingTop: 16, paddingBottom: 80}]}>
        <View style={[a.flex_row, {paddingBottom: 12}]}>
          <Button
            label="Visionboards"
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.navigate('VisionboardBoards')
            }>
            <ButtonText style={[a.text_md, a.font_semi_bold]}>
              ← Visionboards
            </ButtonText>
          </Button>
        </View>
        {board.isLoading ||
        did.isLoading ||
        pins.isLoading ||
        uploads.isLoading ? (
          <View style={[a.align_center, a.p_xl]}>
            <Loader size="xl" />
          </View>
        ) : !board.data ? (
          <Text style={[a.text_md, a.p_xl, a.text_center]}>
            Este visionboard não existe ou está oculto.
          </Text>
        ) : (
          <BoardPage
            board={board.data}
            pins={pins.data?.get(board.data.uri) ?? []}
            uploads={uploads.data?.get(board.data.uri) ?? []}
            pdsUrl={pds.data ?? undefined}
          />
        )}
      </View>
    </Layout.Screen>
  )
}

type TileAction = {label: string; onPress: () => void; destructive?: boolean}

type Tile = {
  key: string
  image: PinImage | undefined
  href?: string
  /** Owner-only actions in the tile's ⋯ menu. */
  actions?: TileAction[]
}

function BoardPage({
  board,
  pins,
  uploads,
  pdsUrl,
}: {
  board: StoredBoard
  pins: StoredPin[]
  uploads: StoredUpload[]
  pdsUrl: string | undefined
}) {
  const {currentAccount} = useSession()
  const moderationOpts = useModerationOpts()
  const isOwner = currentAccount?.did === board.did
  const look = resolveLook(board.board)
  const ordered = useMemo(() => orderedPins(pins), [pins])
  const posts = usePinPostsQuery(ordered.map(p => p.pin.subject.uri))
  const music = musicEmbed(board.board.music)
  const [musicOpen, setMusicOpen] = useState(false)
  const settings = Dialog.useDialogControl()
  const removePin = useRemovePinMutation()
  const removeUpload = useRemoveUploadMutation()
  const movePin = useMovePinMutation()
  const reorderPins = useReorderPinsMutation()
  const saveBoard = useSaveBoardMutation()
  const ownBoards = useBoardsQuery(isOwner ? board.did : undefined)
  const otherBoards = (ownBoards.data ?? []).filter(b => b.uri !== board.uri)
  const uploadImages = useUploadImagesMutation()
  const [progress, setProgress] = useState<string | undefined>()

  const guarded = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn()
      toast.show(done)
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    }
  }

  const coverAction = (uri: string): TileAction[] =>
    board.board.coverPin === uri
      ? []
      : [
          {
            label: 'Definir como capa',
            onPress: () =>
              guarded(
                () =>
                  saveBoard.mutateAsync({
                    rkey: board.rkey,
                    draft: {...board.board, coverPin: uri},
                  }),
                'Capa definida',
              ),
          },
        ]

  const pinActions = (p: StoredPin, index: number): TileAction[] => {
    const step = (dir: -1 | 1, label: string): TileAction[] => {
      const next = movePinStep(ordered, index, dir)
      return next
        ? [
            {
              label,
              onPress: () =>
                guarded(
                  () => reorderPins.mutateAsync({ordered: next}),
                  'Ordem salva',
                ),
            },
          ]
        : []
    }
    return [
      ...coverAction(p.uri),
      ...step(-1, 'Mover para antes'),
      ...step(1, 'Mover para depois'),
      ...otherBoards.map(b => ({
        label: `Mover para “${b.board.title}”`,
        onPress: () =>
          guarded(
            () => movePin.mutateAsync({stored: p, toBoardUri: b.uri}),
            `Movido para ${b.board.title}`,
          ),
      })),
      {
        label: 'Tirar do visionboard',
        destructive: true,
        onPress: () =>
          guarded(
            () => removePin.mutateAsync({rkey: p.rkey}),
            'Tirado do visionboard',
          ),
      },
    ]
  }

  const pinTiles: Tile[] = ordered.map((p, index) => {
    const post = posts.data?.get(p.pin.subject.uri)
    return {
      key: p.uri,
      image: pinImage(post, p.pin.imageIndex, moderationOpts),
      href: post
        ? `/visionboard/view/${post.author.did}/${post.uri.slice(post.uri.lastIndexOf('/') + 1)}`
        : undefined,
      actions: isOwner ? pinActions(p, index) : undefined,
    }
  })
  const uploadTiles: Tile[] = uploads.flatMap(u => {
    if (!pdsUrl) return []
    const url = uploadBlobUrl(pdsUrl, board.did, u.upload.image.ref.$link)
    const ar = u.upload.aspectRatio
    return [
      {
        key: u.uri,
        href: url,
        image: {
          thumb: url,
          fullsize: url,
          alt: u.upload.alt ?? '',
          aspectRatio: ar ? ar.width / ar.height : 1,
        },
        actions: isOwner
          ? [
              ...coverAction(u.uri),
              {
                label: 'Remover imagem',
                destructive: true,
                onPress: () =>
                  guarded(
                    () => removeUpload.mutateAsync({rkey: u.rkey}),
                    'Imagem removida',
                  ),
              },
            ]
          : undefined,
      },
    ]
  })
  // Newest uploads first, then the pinned posts in the board's own order.
  const tiles = [...uploadTiles, ...pinTiles]

  const onFiles = async (files: DroppedFile[]) => {
    const {accepted, rejected} = selectDroppedFiles(files)
    for (const {file, reason} of rejected.slice(0, 3)) {
      toast.show(`${file.name}: ${reason}`, {type: 'error'})
    }
    if (!accepted.length) return
    try {
      const images = await Promise.all(
        accepted.map(async f => ({
          name: f.name,
          image: await fileToPickerImage(f),
        })),
      )
      setProgress(`0/${images.length}`)
      const outcomes = await uploadImages.mutateAsync({
        boardUri: board.uri,
        images,
        onProgress: (done, total) => setProgress(`${done}/${total}`),
      })
      const failed = outcomes.filter(o => o.error)
      const ok = outcomes.length - failed.length
      if (ok) {
        toast.show(
          ok === 1 ? '1 imagem adicionada' : `${ok} imagens adicionadas`,
          {type: 'success'},
        )
      }
      if (failed.length) {
        toast.show(`Não foi possível enviar ${failed.length}.`, {
          type: 'error',
        })
      }
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    } finally {
      setProgress(undefined)
    }
  }

  const font = look.fontFamily ? web({fontFamily: look.fontFamily}) : undefined
  return (
    <View
      style={[
        a.overflow_hidden,
        {backgroundColor: look.bg, borderRadius: 28, minHeight: 520},
      ]}>
      <View
        style={[
          a.flex_row,
          a.flex_wrap,
          a.align_end,
          {gap: 24, paddingHorizontal: 40, paddingTop: 40, paddingBottom: 8},
        ]}>
        <View style={[a.flex_1, {minWidth: 280}]}>
          <Text
            style={[
              a.text_xs,
              a.font_semi_bold,
              {
                color: look.fg,
                opacity: 0.6,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              },
            ]}>
            Visionboard · {tiles.length} {tiles.length === 1 ? 'pin' : 'pins'} ·{' '}
            {VISIBILITY_LABEL[board.board.visibility]}
          </Text>
          <Text
            style={[
              {
                color: look.fg,
                fontSize: 52,
                lineHeight: 56,
                fontWeight: '700',
                letterSpacing: -1.5,
              },
              font,
            ]}>
            {board.board.title}
          </Text>
          {!!board.board.description && (
            <Text
              style={[
                a.text_md,
                {color: look.fg, opacity: 0.7, maxWidth: 520, paddingTop: 8},
                font,
              ]}>
              {board.board.description}
            </Text>
          )}
        </View>
        <View style={[a.flex_row, a.flex_wrap, a.align_center, {gap: 10}]}>
          {music && (
            <Capsule
              label="Música"
              onPress={() => setMusicOpen(v => !v)}
              text="♪ Música"
            />
          )}
          {isOwner && (
            <Capsule
              label="Personalizar"
              variant="ink"
              onPress={() => settings.open()}
              text="✦ Personalizar"
            />
          )}
        </View>
      </View>

      {music && musicOpen && (
        <View style={[{paddingHorizontal: 40, paddingTop: 8, maxWidth: 560}]}>
          {isWeb ? (
            createElement('iframe', {
              src: music.url,
              title: 'Música do visionboard',
              height: music.height,
              loading: 'lazy',
              allow:
                'autoplay; encrypted-media; fullscreen; picture-in-picture',
              style: {width: '100%', border: 0, borderRadius: 16},
            })
          ) : (
            <Link to={board.board.music ?? ''} label="Abrir música">
              <Text style={[{color: look.fg}, a.font_semi_bold]}>
                Abrir música ↗
              </Text>
            </Link>
          )}
        </View>
      )}

      {isOwner && (
        <ImageDropZone
          color={look.fg}
          compact={!!tiles.length}
          busy={uploadImages.isPending}
          progress={progress}
          onFiles={onFiles}
        />
      )}

      {!tiles.length ? (
        !isOwner && (
          <Text
            style={[a.text_md, {color: look.fg, opacity: 0.7, padding: 40}]}>
            Este visionboard ainda está vazio.
          </Text>
        )
      ) : look.layout === 'grid' ? (
        <GridLayout tiles={tiles} frame={look.frame} />
      ) : (
        <View
          style={[
            a.flex_row,
            a.flex_wrap,
            a.justify_center,
            a.align_start,
            {gap: 26, paddingHorizontal: 40, paddingTop: 24, paddingBottom: 56},
          ]}>
          {tiles.map((tile, i) => (
            <MuralTile
              key={tile.key}
              index={i}
              image={tile.image}
              href={tile.href}
              frame={look.frame}
              actions={tile.actions}
            />
          ))}
        </View>
      )}

      {isOwner && (
        <SettingsDialog
          control={settings}
          board={board}
          pins={pins}
          uploads={uploads}
        />
      )}
    </View>
  )
}

function MuralTile({
  index,
  image,
  href,
  frame,
  actions,
}: {
  index: number
  image: PinImage | undefined
  href: string | undefined
  frame: BoardFrame
  actions?: TileAction[]
}) {
  const polaroid = frame === 'polaroid'
  const body = (
    <View
      style={[
        {
          width: TILE_WIDTH,
          marginTop: DROP[index % 4],
          transform: [{rotate: `${TILT[index % 4]}deg`}],
          borderRadius: 30,
          ...(polaroid
            ? {backgroundColor: '#fff', padding: 12, paddingBottom: 40}
            : null),
        },
        web({boxShadow: '0 10px 28px rgba(60, 40, 10, 0.18)'}),
      ]}>
      {polaroid && (
        <View
          style={[
            a.absolute,
            {
              top: -10,
              alignSelf: 'center',
              left: TILE_WIDTH / 2 - 35,
              width: 70,
              height: 22,
              backgroundColor: 'rgba(255,236,170,0.75)',
              transform: [{rotate: '-3deg'}],
              zIndex: 2,
            },
          ]}
        />
      )}
      <View
        style={[
          a.overflow_hidden,
          {
            borderRadius: polaroid ? 20 : 30,
            aspectRatio: image?.aspectRatio ?? 1,
            backgroundColor: 'rgba(0,0,0,0.08)',
          },
        ]}>
        {image && (
          <Image
            accessibilityIgnoresInvertColors
            source={{uri: image.thumb}}
            style={[a.w_full, a.h_full]}
            contentFit="cover"
            accessibilityLabel={image.alt}
            accessibilityHint=""
          />
        )}
      </View>
      {!!actions?.length && <TileMenu actions={actions} />}
    </View>
  )
  return href ? (
    <Link to={href} label="Abrir imagem">
      {body}
    </Link>
  ) : (
    body
  )
}

/** ⋯ menu of a tile (owner only): cover, order, move, remove. */
function TileMenu({actions}: {actions: TileAction[]}) {
  return (
    <View style={[a.absolute, {top: 8, right: 8, zIndex: 3}]}>
      <Menu.Root>
        <Menu.Trigger label="Opções da imagem">
          {({props}) => (
            <Button
              {...props}
              label="Opções da imagem"
              size="tiny"
              variant="solid"
              color="secondary"
              style={[
                a.rounded_full,
                {backgroundColor: 'rgba(255,255,255,0.85)'},
              ]}>
              <ButtonText style={[a.font_semi_bold, {color: '#111315'}]}>
                ⋯
              </ButtonText>
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer showCancel>
          <Menu.Group>
            {actions.map(action => (
              <Menu.Item
                key={action.label}
                label={action.label}
                onPress={action.onPress}>
                <Menu.ItemText
                  style={action.destructive ? {color: '#E5214F'} : undefined}>
                  {action.label}
                </Menu.ItemText>
              </Menu.Item>
            ))}
          </Menu.Group>
        </Menu.Outer>
      </Menu.Root>
    </View>
  )
}

function GridLayout({tiles, frame}: {tiles: Tile[]; frame: BoardFrame}) {
  const {width} = useWindowDimensions()
  const count = gridColumnCount(width)
  const narrow = width < 600
  const columns = useMemo(() => {
    const cols: (typeof tiles)[] = Array.from({length: count}, () => [])
    const heights = Array.from({length: count}, () => 0)
    for (const tile of tiles) {
      let target = 0
      for (let c = 1; c < count; c++) {
        if (heights[c] < heights[target]) target = c
      }
      cols[target].push(tile)
      heights[target] += 1 / (tile.image?.aspectRatio ?? 1)
    }
    return cols
  }, [tiles, count])
  return (
    <View
      style={[
        a.flex_row,
        {
          gap: 8,
          paddingHorizontal: narrow ? 12 : 40,
          paddingTop: 24,
          paddingBottom: 56,
        },
      ]}>
      {columns.map((col, i) => (
        <View key={i} style={[a.flex_1, {gap: 8, minWidth: 0}]}>
          {col.map(tile => {
            const href = tile.href
            const img = (
              <View
                style={[
                  a.overflow_hidden,
                  {
                    borderRadius: frame === 'polaroid' ? 20 : 28,
                    aspectRatio: tile.image?.aspectRatio ?? 1,
                    backgroundColor: 'rgba(0,0,0,0.08)',
                  },
                ]}>
                {tile.image && (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={{uri: tile.image.thumb}}
                    style={[a.w_full, a.h_full]}
                    contentFit="cover"
                    accessibilityLabel={tile.image.alt}
                    accessibilityHint=""
                  />
                )}
              </View>
            )
            return (
              <View key={tile.key}>
                {href ? (
                  <Link to={href} label="Abrir imagem">
                    {img}
                  </Link>
                ) : (
                  img
                )}
                {!!tile.actions?.length && <TileMenu actions={tile.actions} />}
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function SettingsDialog({
  control,
  board,
  pins,
  uploads,
}: {
  control: Dialog.DialogControlProps
  board: StoredBoard
  pins: StoredPin[]
  uploads: StoredUpload[]
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const save = useSaveBoardMutation()
  const del = useDeleteBoardMutation()
  const look = resolveLook(board.board)
  const [title, setTitle] = useState(board.board.title)
  const [description, setDescription] = useState(board.board.description ?? '')
  const [theme, setTheme] = useState<BoardTheme>(look.theme)
  const [font, setFont] = useState<BoardFont>(look.font)
  const [frame, setFrame] = useState<BoardFrame>(look.frame)
  const [layout, setLayout] = useState<BoardLayout>(look.layout)
  const [music, setMusic] = useState(board.board.music ?? '')
  const [visibility, setVisibility] = useState(board.board.visibility)

  const musicInvalid = !!music.trim() && !musicEmbed(music)

  const onSave = async () => {
    if (!title.trim() || musicInvalid) return
    try {
      await save.mutateAsync({
        rkey: board.rkey,
        draft: {
          ...board.board,
          title: title.trim(),
          description: description.trim() || undefined,
          theme,
          font,
          frame,
          layout,
          music: music.trim() || undefined,
          visibility,
        },
      })
      control.close()
      toast.show('Visionboard atualizado', {type: 'success'})
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    }
  }

  const onDelete = async () => {
    try {
      await del.mutateAsync({
        rkey: board.rkey,
        pinRkeys: pins.map(p => p.rkey),
        uploadRkeys: uploads.map(u => u.rkey),
      })
      control.close(() => navigation.navigate('VisionboardBoards'))
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    }
  }

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Personalizar visionboard"
        style={web({maxWidth: 460})}>
        <View style={[a.gap_md]}>
          <Text style={[a.text_xl, a.font_semi_bold]}>Personalizar</Text>

          <Field label="Título">
            <TextField.Root>
              <TextField.Input
                label="Título"
                value={title}
                onChangeText={setTitle}
                maxLength={60}
              />
            </TextField.Root>
          </Field>
          <Field label="Descrição">
            <TextField.Root>
              <TextField.Input
                label="Descrição"
                value={description}
                onChangeText={setDescription}
                maxLength={300}
              />
            </TextField.Root>
          </Field>

          <Field label="Fundo">
            <View style={[a.flex_row, a.flex_wrap, {gap: 10}]}>
              {(Object.keys(BOARD_THEMES) as BoardTheme[]).map(key => (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{selected: theme === key}}
                  accessibilityLabel={BOARD_THEMES[key].label}
                  accessibilityHint=""
                  onPress={() => setTheme(key)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: BOARD_THEMES[key].bg,
                    borderWidth: 2,
                    borderColor:
                      theme === key
                        ? t.palette.contrast_900
                        : t.palette.contrast_100,
                  }}
                />
              ))}
            </View>
          </Field>
          <Field label="Fonte">
            <Options
              value={font}
              onChange={setFont}
              options={(Object.keys(BOARD_FONTS) as BoardFont[]).map(k => ({
                value: k,
                label: BOARD_FONTS[k].label,
              }))}
            />
          </Field>
          <Field label="Moldura dos pins">
            <Options
              value={frame}
              onChange={setFrame}
              options={BOARD_FRAMES.map(k => ({
                value: k,
                label: k === 'polaroid' ? 'Polaroid' : 'Limpa',
              }))}
            />
          </Field>
          <Field label="Layout">
            <Options
              value={layout}
              onChange={setLayout}
              options={BOARD_LAYOUTS.map(k => ({
                value: k,
                label: k === 'mural' ? 'Mural' : 'Grade',
              }))}
            />
          </Field>
          <Field label="Música (link do Spotify, YouTube ou SoundCloud)">
            <TextField.Root isInvalid={musicInvalid}>
              <TextField.Input
                label="Link da música"
                placeholder="https://open.spotify.com/track/…"
                value={music}
                onChangeText={setMusic}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </TextField.Root>
            {musicInvalid && (
              <Text style={[a.text_sm, {color: '#E5214F'}]}>
                Só links do Spotify, YouTube ou SoundCloud.
              </Text>
            )}
          </Field>
          <Field label="Visibilidade">
            <Options
              value={visibility}
              onChange={setVisibility}
              options={[
                {value: 'public', label: VISIBILITY_LABEL.public},
                {value: 'private', label: VISIBILITY_LABEL.private},
              ]}
            />
            {visibility === 'private' && (
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {HIDDEN_HINT}
              </Text>
            )}
          </Field>

          <Button
            label="Salvar"
            size="large"
            variant="solid"
            color="primary"
            disabled={!title.trim() || musicInvalid || save.isPending}
            onPress={onSave}
            style={[a.rounded_full]}>
            <ButtonText>Salvar</ButtonText>
          </Button>
          <Button
            label="Apagar visionboard"
            size="small"
            variant="ghost"
            color="negative"
            disabled={del.isPending}
            onPress={onDelete}
            style={[a.self_start]}>
            <ButtonText>Apagar visionboard</ButtonText>
          </Button>
        </View>
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <View style={[a.gap_xs]}>
      <Text
        style={[
          a.text_xs,
          a.font_semi_bold,
          {opacity: 0.6, letterSpacing: 1, textTransform: 'uppercase'},
        ]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

function Options<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: {value: T; label: string}[]
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.flex_wrap, {gap: 8}]}>
      {options.map(o => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{selected: active}}
            accessibilityLabel={o.label}
            accessibilityHint=""
            onPress={() => onChange(o.value)}
            style={[
              a.rounded_full,
              {
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: active
                  ? t.palette.contrast_900
                  : t.palette.contrast_50,
              },
            ]}>
            <Text
              style={[
                a.text_sm,
                a.font_semi_bold,
                {color: active ? t.palette.white : t.palette.contrast_900},
              ]}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
