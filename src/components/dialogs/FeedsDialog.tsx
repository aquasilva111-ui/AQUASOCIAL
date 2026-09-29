import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {useQueryClient} from '@tanstack/react-query'

import {PROD_DEFAULT_FEED} from '#/lib/constants'
import {
  type Interest,
  interests as allInterests,
  popularInterests,
  useInterestsDisplayNames,
} from '#/lib/interests'
import {cleanError} from '#/lib/strings/errors'
import {usePinnedFeedsInfos} from '#/state/queries/feed'
import {
  preferencesQueryKey,
  usePreferencesQuery,
} from '#/state/queries/preferences'
import {type UsePreferencesQueryResponse} from '#/state/queries/preferences/types'
import {useAgent} from '#/state/session'
import * as Toast from '#/view/com/util/Toast'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import * as TextField from '#/components/forms/TextField'
import {Atom_Stroke2_Corner0_Rounded as AtomIcon} from '#/components/icons/Atom'
import {Book_Stroke2_Corner2_Rounded as BookIcon} from '#/components/icons/Book'
import {BulletList_Stroke2_Corner0_Rounded as ListIcon} from '#/components/icons/BulletList'
import {Camera_Stroke2_Corner0_Rounded as CameraIcon} from '#/components/icons/Camera'
import {Check_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {
  ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon,
} from '#/components/icons/Chevron'
import {CodeBrackets_Stroke2_Corner0_Rounded as CodeIcon} from '#/components/icons/CodeBrackets'
import {ColorPalette_Stroke2_Corner0_Rounded as PaletteIcon} from '#/components/icons/ColorPalette'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {EmojiSmile_Stroke2_Corner0_Rounded as SmileIcon} from '#/components/icons/Emoji'
import {Flag_Stroke2_Corner0_Rounded as FlagIcon} from '#/components/icons/Flag'
import {GameController_Stroke2_Corner0_Rounded as GameIcon} from '#/components/icons/GameController'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {Group3_Stroke2_Corner0_Rounded as GroupIcon} from '#/components/icons/Group'
import {Growth_Stroke2_Corner0_Rounded as GrowthIcon} from '#/components/icons/Growth'
import {Heart2_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import {Leaf_Stroke2_Corner0_Rounded as LeafIcon} from '#/components/icons/Leaf'
import {Macintosh_Stroke2_Corner2_Rounded as TechIcon} from '#/components/icons/Macintosh'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import {MusicNote_Stroke2_Corner0_Rounded as MusicIcon} from '#/components/icons/MusicNote'
import {News2_Stroke2_Corner0_Rounded as NewsIcon} from '#/components/icons/News2'
import {Newspaper_Stroke2_Corner2_Rounded as NewspaperIcon} from '#/components/icons/Newspaper'
import {PageText_Stroke2_Corner0_Rounded as PageIcon} from '#/components/icons/PageText'
import {Pencil_Stroke2_Corner0_Rounded as PencilIcon} from '#/components/icons/Pencil'
import {Pizza_Stroke2_Corner0_Rounded as PizzaIcon} from '#/components/icons/Pizza'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {OpenQuote_Stroke2_Corner0_Rounded as QuoteIcon} from '#/components/icons/Quote'
import {Shaka_Stroke2_Corner0_Rounded as ShakaIcon} from '#/components/icons/Shaka'
import {Tree_Stroke2_Corner0_Rounded as TreeIcon} from '#/components/icons/Tree'
import {VideoClip_Stroke2_Corner0_Rounded as VideoIcon} from '#/components/icons/VideoClip'
import {Window_Stroke2_Corner2_Rounded as TvIcon} from '#/components/icons/Window'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

const TOPIC_ICONS: Record<Interest, React.ComponentType<SVGIconProps>> = {
  animals: LeafIcon,
  art: PaletteIcon,
  books: BookIcon,
  comedy: SmileIcon,
  comics: QuoteIcon,
  culture: GlobeIcon,
  dev: CodeIcon,
  education: PageIcon,
  finance: GrowthIcon,
  food: PizzaIcon,
  gaming: GameIcon,
  journalism: NewspaperIcon,
  movies: VideoIcon,
  music: MusicIcon,
  nature: TreeIcon,
  news: NewsIcon,
  pets: HeartIcon,
  photography: CameraIcon,
  politics: FlagIcon,
  science: AtomIcon,
  sports: ShakaIcon,
  tech: TechIcon,
  tv: TvIcon,
  writers: PencilIcon,
}

const COLLAPSED_TOPICS = 6
const FOR_YOU_FEED = `feedgen|${PROD_DEFAULT_FEED('whats-hot')}`

/** Popular topics first, then the rest alphabetically. */
const TOPIC_ORDER: Interest[] = [
  ...popularInterests,
  ...allInterests.filter(i => !(popularInterests as Interest[]).includes(i)),
]

export {useDialogControl as useFeedsDialogControl} from '#/components/Dialog'

export function FeedsDialog({control}: {control: Dialog.DialogControlProps}) {
  return (
    <Dialog.Outer control={control}>
      <Dialog.Handle />
      <Inner />
    </Dialog.Outer>
  )
}

function Inner() {
  const t = useTheme()
  const control = Dialog.useDialogContext()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  return (
    <Dialog.ScrollableInner
      label="Feeds"
      style={web({maxWidth: 520, borderRadius: 24})}>
      <View style={[a.gap_xl]}>
        <View style={[a.flex_row, a.align_center, a.justify_center]}>
          <Text style={[a.text_xl, a.font_bold]}>Feeds</Text>
        </View>

        <TextField.Root>
          <TextField.Icon icon={SearchIcon} />
          <TextField.Input
            label="Buscar feeds e tópicos"
            placeholder="Buscar"
            value={query}
            onChangeText={setQuery}
          />
        </TextField.Root>

        <PinnedSection query={q} onNavigate={() => control.close()} />
        <TopicsSection query={q} />

        {!q && (
          <View style={[a.border_t, t.atoms.border_contrast_low]}>
            <NavRow
              label="Listas"
              icon={ListIcon}
              to="/lists"
              onNavigate={() => control.close()}
            />
            <NavRow label="Comunidades" icon={GroupIcon} comingSoon />
          </View>
        )}
      </View>
      <Dialog.Close />
    </Dialog.ScrollableInner>
  )
}

function SectionHeading({
  title,
  right,
}: {
  title: string
  right?: React.ReactNode
}) {
  return (
    <View style={[a.flex_row, a.align_center, a.justify_between]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {right}
    </View>
  )
}

function PinnedSection({
  query,
  onNavigate,
}: {
  query: string
  onNavigate: () => void
}) {
  const t = useTheme()
  const {data: pinned} = usePinnedFeedsInfos()
  // Following and For You already live in the home tabs.
  const feeds = (pinned ?? []).filter(
    f =>
      f.feedDescriptor !== 'following' &&
      f.feedDescriptor !== FOR_YOU_FEED &&
      (!query || f.displayName.toLowerCase().includes(query)),
  )

  return (
    <View style={[a.gap_sm]}>
      <SectionHeading
        title="Fixados"
        right={
          <Link
            to="/feeds"
            label="Gerenciar feeds"
            onPress={onNavigate}
            size="tiny"
            variant="ghost"
            color="primary">
            <Text
              style={[
                a.text_sm,
                a.font_semi_bold,
                {color: t.palette.primary_500},
              ]}>
              Gerenciar
            </Text>
          </Link>
        }
      />
      {feeds.length ? (
        feeds.map(feed => (
          <Link
            key={feed.feedDescriptor}
            to={feed.route.href}
            label={feed.displayName}
            onPress={onNavigate}
            style={[a.flex_row, a.align_center, a.gap_md, a.py_xs]}>
            {({hovered}) => (
              <>
                <UserAvatar
                  type={feed.type === 'list' ? 'list' : 'algo'}
                  size={44}
                  avatar={feed.avatar}
                />
                <View style={[a.flex_1]}>
                  <Text
                    style={[a.text_md, a.font_bold, hovered && a.underline]}
                    numberOfLines={1}>
                    {feed.displayName}
                  </Text>
                  {!!feed.creatorHandle && (
                    <Text
                      style={[a.text_sm, t.atoms.text_contrast_medium]}
                      numberOfLines={1}>
                      @{feed.creatorHandle}
                    </Text>
                  )}
                </View>
                <ChevronRightIcon size="sm" style={t.atoms.text_contrast_low} />
              </>
            )}
          </Link>
        ))
      ) : (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {query ? 'Nenhum feed fixado com esse nome.' : 'Nada para mostrar.'}
        </Text>
      )}
    </View>
  )
}

function TopicsSection({query}: {query: string}) {
  const t = useTheme()
  const names = useInterestsDisplayNames()
  const {data: preferences} = usePreferencesQuery()
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const toggle = useToggleInterest()
  const selected = preferences?.interests.tags ?? []

  const topics = useMemo(
    () =>
      TOPIC_ORDER.filter(
        topic => !query || names[topic].toLowerCase().includes(query),
      ),
    [query, names],
  )
  const expanded = showAll || !!query
  const visible = expanded ? topics : topics.slice(0, COLLAPSED_TOPICS)

  return (
    <View style={[a.gap_sm]}>
      <SectionHeading
        title="Tópicos"
        right={
          <Button
            label={open ? 'Recolher tópicos' : 'Mostrar tópicos'}
            size="small"
            shape="round"
            variant="ghost"
            color="secondary"
            onPress={() => setOpen(!open)}>
            <View
              style={web({
                transition: 'transform 200ms ease',
                transform: open ? undefined : 'rotate(-90deg)',
              })}>
              <ButtonIcon icon={ChevronDownIcon} />
            </View>
          </Button>
        }
      />
      {open && (
        <>
          <Text
            style={[a.text_sm, a.leading_snug, t.atoms.text_contrast_medium]}>
            Os tópicos que você adiciona influenciam o que aparece no seu For
            You.
          </Text>
          {visible.map(topic => {
            const Icon = TOPIC_ICONS[topic]
            const isSelected = selected.includes(topic)
            return (
              <View
                key={topic}
                style={[a.flex_row, a.align_center, a.gap_md, a.py_2xs]}>
                <View
                  style={[
                    a.align_center,
                    a.justify_center,
                    a.rounded_md,
                    t.atoms.bg_contrast_50,
                    {width: 44, height: 44},
                  ]}>
                  <Icon size="md" style={t.atoms.text} />
                </View>
                <Text style={[a.flex_1, a.text_md, a.font_bold]}>
                  {names[topic]}
                </Text>
                <Button
                  label={
                    isSelected
                      ? `Remover ${names[topic]} dos seus tópicos`
                      : `Adicionar ${names[topic]} aos seus tópicos`
                  }
                  size="tiny"
                  shape="round"
                  variant="solid"
                  color={isSelected ? 'secondary' : 'primary'}
                  onPress={() => toggle(topic, !isSelected)}>
                  <ButtonIcon icon={isSelected ? CheckIcon : PlusIcon} />
                </Button>
              </View>
            )
          })}
          {!expanded && topics.length > COLLAPSED_TOPICS && (
            <Button
              label="Ver mais tópicos"
              size="small"
              variant="ghost"
              color="secondary"
              onPress={() => setShowAll(true)}>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {`Ver mais ${topics.length - COLLAPSED_TOPICS}`}
              </Text>
            </Button>
          )}
          {!topics.length && (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Nenhum tópico encontrado.
            </Text>
          )}
        </>
      )}
    </View>
  )
}

function NavRow({
  label,
  icon: Icon,
  to,
  onNavigate,
  comingSoon,
}: {
  label: string
  icon: React.ComponentType<SVGIconProps>
  to?: string
  onNavigate?: () => void
  comingSoon?: boolean
}) {
  const t = useTheme()
  const content = (
    <>
      <Icon size="md" style={t.atoms.text} />
      <Text style={[a.flex_1, a.text_lg, a.font_bold]}>{label}</Text>
      {comingSoon ? (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>Em breve</Text>
      ) : (
        <ChevronRightIcon size="sm" style={t.atoms.text_contrast_medium} />
      )}
    </>
  )
  const rowStyle = [a.flex_row, a.align_center, a.gap_md, a.py_md]
  if (!to) {
    return <View style={[rowStyle, {opacity: 0.6}]}>{content}</View>
  }
  return (
    <Link to={to} label={label} onPress={onNavigate} style={rowStyle}>
      {content}
    </Link>
  )
}

/** Adds/removes an interest; interests steer the Discover ("For You") feed. */
function useToggleInterest() {
  const agent = useAgent()
  const qc = useQueryClient()
  const {data: preferences} = usePreferencesQuery()

  return async (topic: Interest, add: boolean) => {
    const current = preferences?.interests.tags ?? []
    const next = add
      ? [...new Set([...current, topic])]
      : current.filter(tag => tag !== topic)
    const update = (tags: string[]) =>
      qc.setQueriesData(
        {queryKey: preferencesQueryKey},
        (old?: UsePreferencesQueryResponse) =>
          old ? {...old, interests: {...old.interests, tags}} : old,
      )
    update(next)
    try {
      await agent.setInterestsPref({tags: next})
    } catch (e) {
      update(current)
      Toast.show(`Não foi possível salvar: ${cleanError(e)}`, 'xmark')
    }
  }
}
