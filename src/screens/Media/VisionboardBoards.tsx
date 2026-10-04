import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'
import {type AppBskyFeedDefs} from '@atproto/api'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {
  newBoardRecord,
  orderedPins,
  type StoredPin,
} from '#/lib/visionboard/boards'
import {pinImage} from '#/lib/visionboard/pin-image'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {
  type StoredBoard,
  useBoardsQuery,
  usePinPostsQuery,
  usePinsByBoardQuery,
  useSaveBoardMutation,
} from '#/state/queries/visionboard-boards'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Loader} from '#/components/Loader'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {Capsule} from '#/components/visionboard/VisionboardCapsule'
import {VisionboardTopBar} from '#/components/visionboard/VisionboardTopBar'

const COVER_RADIUS = 28

/** "Seus Visionboards": every folder of the signed-in user. */
export function VisionboardBoardsScreen() {
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const [search, setSearch] = useState('')
  const boards = useBoardsQuery(currentAccount?.did)
  const pins = usePinsByBoardQuery(currentAccount?.did)
  const createControl = Dialog.useDialogControl()

  const coverUris = useMemo(() => {
    const uris: string[] = []
    for (const b of boards.data ?? []) {
      for (const p of newest(pins.data?.get(b.uri) ?? [], 3)) {
        uris.push(p.pin.subject.uri)
      }
    }
    return uris
  }, [boards.data, pins.data])
  const posts = usePinPostsQuery(coverUris)
  const totalPins = [...(pins.data?.values() ?? [])].reduce(
    (n, list) => n + list.length,
    0,
  )

  return (
    <Layout.Screen testID="visionboard-boards" hideCenterBorders>
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
      <View style={[a.w_full, a.px_lg, {paddingTop: 24, paddingBottom: 80}]}>
        <View
          style={[
            a.flex_row,
            a.align_end,
            a.justify_between,
            a.flex_wrap,
            a.gap_md,
            a.px_xs,
            {marginBottom: 22},
          ]}>
          <View>
            <Text
              style={[{fontSize: 34, fontWeight: '700', letterSpacing: -1}]}>
              Seus Visionboards
            </Text>
            <Text style={[a.text_md, {opacity: 0.6}]}>
              {boards.data?.length ?? 0}{' '}
              {boards.data?.length === 1 ? 'visionboard' : 'visionboards'} ·{' '}
              {totalPins} {totalPins === 1 ? 'pin' : 'pins'}
            </Text>
          </View>
          <Capsule
            label="Novo visionboard"
            variant="ink"
            onPress={() =>
              currentAccount ? createControl.open() : setShowLoggedOut(true)
            }
            text="＋ Novo visionboard"
          />
        </View>

        {!currentAccount ? (
          <Text style={[a.text_md, a.p_xl, a.text_center]}>
            Entre na sua conta para ver seus Visionboards.
          </Text>
        ) : boards.isLoading ? (
          <View style={[a.align_center, a.p_xl]}>
            <Loader size="xl" />
          </View>
        ) : (
          <View style={[a.flex_row, a.flex_wrap, {gap: 22}]}>
            {(boards.data ?? []).map(b => (
              <BoardCard
                key={b.uri}
                board={b}
                pins={pins.data?.get(b.uri) ?? []}
                posts={posts.data}
              />
            ))}
            <Button
              label="Novo visionboard"
              onPress={() => createControl.open()}
              style={[{width: 260}]}>
              <NewBoardTile />
            </Button>
          </View>
        )}
      </View>
      <CreateBoardDialog control={createControl} />
    </Layout.Screen>
  )
}

const newest = (pins: StoredPin[], n: number) =>
  [...pins]
    .sort((x, y) => y.pin.createdAt.localeCompare(x.pin.createdAt))
    .slice(0, n)

function NewBoardTile() {
  const t = useTheme()
  return (
    <View style={[{width: 260}]}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          {
            aspectRatio: 1 / 0.82,
            borderRadius: COVER_RADIUS,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: t.palette.contrast_200,
          },
        ]}>
        <Text style={[{fontSize: 44, fontWeight: '300', opacity: 0.5}]}>
          ＋
        </Text>
      </View>
      <Text style={[a.text_lg, a.font_semi_bold, {paddingTop: 10}, a.px_xs]}>
        Novo visionboard
      </Text>
      <Text style={[a.text_sm, a.px_xs, {opacity: 0.6}]}>
        com fundo, fonte e música
      </Text>
    </View>
  )
}

function BoardCard({
  board,
  pins,
  posts,
}: {
  board: StoredBoard
  pins: StoredPin[]
  posts: Map<string, AppBskyFeedDefs.PostView> | undefined
}) {
  const t = useTheme()
  const moderationOpts = useModerationOpts()
  const covers = newest(orderedPins(pins), 3).map(p =>
    pinImage(posts?.get(p.pin.subject.uri), p.pin.imageIndex, moderationOpts),
  )
  const label = board.board.visibility === 'private' ? 'Privado' : 'Público'
  return (
    <Link
      to={`/visionboard/boards/${board.did}/${board.rkey}`}
      label={board.board.title}
      style={[{width: 260}]}>
      <View style={[{width: 260}]}>
        <View
          style={[
            a.flex_row,
            a.overflow_hidden,
            t.atoms.bg_contrast_25,
            {aspectRatio: 1 / 0.82, borderRadius: COVER_RADIUS, gap: 3},
          ]}>
          <CoverSlot image={covers[0]} style={{flex: 2}} />
          <View style={[{flex: 1, gap: 3}]}>
            <CoverSlot image={covers[1]} style={{flex: 1}} />
            <CoverSlot image={covers[2]} style={{flex: 1}} />
          </View>
          <Tag text={label} />
          {!!board.board.music && <Tag text="♪" right />}
        </View>
        <Text
          style={[a.text_lg, a.font_semi_bold, a.px_xs, {paddingTop: 10}]}
          numberOfLines={1}>
          {board.board.title}
        </Text>
        <Text style={[a.text_sm, a.px_xs, {opacity: 0.6}]}>
          {pins.length} {pins.length === 1 ? 'pin' : 'pins'}
        </Text>
      </View>
    </Link>
  )
}

function CoverSlot({
  image,
  style,
}: {
  image: ReturnType<typeof pinImage>
  style: object
}) {
  const t = useTheme()
  return (
    <View style={[t.atoms.bg_contrast_50, style]}>
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
  )
}

function Tag({text, right}: {text: string; right?: boolean}) {
  return (
    <View
      style={[
        a.absolute,
        a.rounded_full,
        {
          top: 10,
          [right ? 'right' : 'left']: 10,
          paddingHorizontal: 11,
          paddingVertical: 4,
          backgroundColor: 'rgba(0,0,0,0.35)',
        },
        web({backdropFilter: 'blur(10px)'}),
      ]}>
      <Text style={[a.text_xs, a.font_semi_bold, {color: '#fff'}]}>{text}</Text>
    </View>
  )
}

function CreateBoardDialog({control}: {control: Dialog.DialogControlProps}) {
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const saveBoard = useSaveBoardMutation()
  const [title, setTitle] = useState('')

  const create = async () => {
    const name = title.trim()
    if (!name || !currentAccount) return
    try {
      const {uri} = await saveBoard.mutateAsync({
        draft: newBoardRecord({title: name, visibility: 'private'}),
      })
      setTitle('')
      control.close(() =>
        navigation.navigate('VisionboardBoardView', {
          name: currentAccount.did,
          rkey: uri.slice(uri.lastIndexOf('/') + 1),
        }),
      )
    } catch (e) {
      toast.show(cleanError(e), {type: 'error'})
    }
  }

  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Novo visionboard"
        style={web({maxWidth: 420})}>
        <View style={[a.gap_md]}>
          <Text style={[a.text_xl, a.font_semi_bold]}>Novo visionboard</Text>
          <Text style={[a.text_md, {opacity: 0.7}]}>
            Dê um nome. Depois você escolhe fundo, fonte e música.
          </Text>
          <TextField.Root>
            <TextField.Input
              label="Nome do visionboard"
              placeholder="Ex.: Verão 2026"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={create}
              maxLength={60}
              autoFocus
            />
          </TextField.Root>
          <Button
            label="Criar"
            size="large"
            variant="solid"
            color="primary"
            disabled={!title.trim() || saveBoard.isPending}
            onPress={create}
            style={[a.rounded_full]}>
            <ButtonText>Criar</ButtonText>
          </Button>
        </View>
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}
