import {useState} from 'react'
import {TextInput, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {
  type DesignFormat,
  filterTemplates,
  formatById,
  formatRatio,
  FORMATS,
  formatSize,
  hubPath,
  type HubTabId,
  type HubTemplate,
  isHubTab,
  TEMPLATE_CATEGORIES,
  TEMPLATES,
} from '#/lib/creative-hub/model'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {useDocs, useDocsApi} from '#/state/docs/store'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {DocsList} from '#/components/docs/DocsList'
import {CREATIVE_ORANGE} from '#/components/icons/LaunchMark'
import {Link} from '#/components/Link'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {HubShell} from './HubShell'

export function CreativeHubScreen({
  route,
}: NativeStackScreenProps<
  CommonNavigatorParams,
  'CreativeHub' | 'CreativeHubTab'
>) {
  const raw = (route.params as {tab?: string} | undefined)?.tab
  const tab: HubTabId = isHubTab(raw) ? raw : 'home'
  return (
    <HubShell tab={tab}>
      {tab === 'home' && <HomeTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'docs' && <DocsList />}
      {tab === 'brand' && <BrandTab />}
    </HubShell>
  )
}

function SectionTitle({
  title,
  to,
  toLabel,
}: {
  title: string
  to?: string
  toLabel?: string
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.justify_between, a.align_center]}>
      <Text style={[a.text_lg, a.font_bold]}>{title}</Text>
      {to && toLabel && (
        <Link to={to} label={toLabel}>
          <Text
            style={[a.text_sm, a.font_bold, {color: t.palette.primary_500}]}>
            {toLabel}
          </Text>
        </Link>
      )}
    </View>
  )
}

/** Creates a doc, or says the design editor is not there yet. */
function useStartFormat() {
  const navigation = useNavigation<NavigationProp>()
  const {createDoc} = useDocsApi()
  return (format: DesignFormat) => {
    if (format.id === 'doc') {
      const doc = createDoc()
      if (doc) navigation.navigate('DocEditor', {id: doc.id})
      return
    }
    Toast.show(
      `O editor de ${format.label.toLowerCase()} chega na próxima etapa.`,
      {type: 'info'},
    )
  }
}

function FormatTiles() {
  const t = useTheme()
  const start = useStartFormat()
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_md]}>
      {FORMATS.map(f => (
        <Button
          key={f.id}
          label={`${f.label}, ${formatSize(f)}${f.available ? '' : ', em breve'}`}
          onPress={() => start(f)}
          style={[{width: 96}]}>
          <View style={[a.align_center, a.gap_xs, a.flex_1]}>
            <View
              style={[
                a.rounded_lg,
                a.align_center,
                a.justify_center,
                {width: 64, height: 64, backgroundColor: f.color},
              ]}>
              <Text style={[a.font_bold, {color: '#fff', fontSize: 11}]}>
                {formatRatio(f)}
              </Text>
            </View>
            <Text style={[a.text_xs, a.font_bold, a.text_center]}>
              {f.label}
            </Text>
            {!f.available && (
              <Text style={[a.text_2xs, t.atoms.text_contrast_medium]}>
                Em breve
              </Text>
            )}
          </View>
        </Button>
      ))}
    </View>
  )
}

function TemplateCard({template}: {template: HubTemplate}) {
  const t = useTheme()
  const f = formatById(template.format)
  const ratio = f.width && f.height ? f.width / f.height : 4 / 5
  const start = useStartFormat()
  return (
    <Button
      label={`Modelo ${template.name}, ${f.label}`}
      onPress={() => start(f)}
      style={[{width: 164}]}>
      <View style={[a.gap_xs, a.flex_1]}>
        <View
          style={[
            a.rounded_md,
            a.justify_end,
            a.p_md,
            a.border,
            t.atoms.border_contrast_low,
            {
              backgroundColor: template.bg,
              aspectRatio: Math.max(0.56, Math.min(1.6, ratio)),
              width: '100%',
            },
          ]}>
          <Text
            style={[
              a.font_bold,
              {color: template.fg, fontSize: 16, lineHeight: 18},
            ]}>
            {template.headline}
          </Text>
          <Text style={[{color: template.fg, fontSize: 10, opacity: 0.85}]}>
            {template.subline}
          </Text>
        </View>
        <Text style={[a.text_xs, a.font_bold]} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={[a.text_2xs, t.atoms.text_contrast_medium]}>
          {f.label} · {formatSize(f)}
        </Text>
      </View>
    </Button>
  )
}

function TemplateRow({list}: {list: HubTemplate[]}) {
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_lg]}>
      {list.map(tpl => (
        <TemplateCard key={tpl.id} template={tpl} />
      ))}
    </View>
  )
}

function HomeTab() {
  const t = useTheme()
  const docs = useDocs()
  const start = useStartFormat()
  return (
    <>
      <View
        style={[
          a.rounded_lg,
          a.p_2xl,
          a.gap_md,
          {backgroundColor: CREATIVE_ORANGE},
        ]}>
        <Text style={[a.text_2xl, a.font_bold, {color: '#fff'}]}>
          O que você quer criar hoje?
        </Text>
        <Text style={[a.text_md, {color: '#fff', opacity: 0.92}]}>
          Posts, stories, capas e docs. Depois é só publicar no Aqua.
        </Text>
        <View style={[a.flex_row]}>
          <Button
            label="Novo documento"
            size="large"
            color="secondary"
            onPress={() => start(formatById('doc'))}>
            <ButtonText>Novo documento</ButtonText>
          </Button>
        </View>
      </View>

      <FormatTiles />

      <View style={[a.gap_md]}>
        <SectionTitle
          title="Modelos para você"
          to={hubPath('templates')}
          toLabel="Ver todos"
        />
        <TemplateRow list={TEMPLATES.slice(0, 5)} />
      </View>

      <View style={[a.gap_md]}>
        <SectionTitle
          title="Seus projetos recentes"
          to={hubPath('projects')}
          toLabel="Abrir projetos"
        />
        {docs.length === 0 ? (
          <Text style={[t.atoms.text_contrast_medium]}>
            Seus docs e designs aparecem aqui.
          </Text>
        ) : (
          <View style={[a.gap_sm]}>
            {docs.slice(0, 3).map(doc => (
              <ProjectRow
                key={doc.id}
                id={doc.id}
                title={doc.title}
                at={doc.updatedAt}
              />
            ))}
          </View>
        )}
      </View>
    </>
  )
}

function TemplatesTab() {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<HubTemplate['category']>()
  const list = filterTemplates(TEMPLATES, {category, query})
  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Pesquise modelos"
        placeholderTextColor={t.atoms.text_contrast_low.color}
        accessibilityLabel="Pesquisar modelos"
        accessibilityHint=""
        style={[
          a.border,
          a.rounded_full,
          a.px_lg,
          a.py_sm,
          a.text_md,
          t.atoms.text,
          t.atoms.border_contrast_low,
        ]}
      />
      <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
        <Chip
          label="Tudo"
          on={!category}
          onPress={() => setCategory(undefined)}
        />
        {TEMPLATE_CATEGORIES.map(c => (
          <Chip
            key={c.id}
            label={c.label}
            on={category === c.id}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </View>
      {list.length ? (
        <TemplateRow list={list} />
      ) : (
        <Text style={[t.atoms.text_contrast_medium]}>
          Nenhum modelo encontrado para essa busca.
        </Text>
      )}
    </>
  )
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string
  on: boolean
  onPress: () => void
}) {
  return (
    <Button
      label={label}
      size="small"
      color={on ? 'primary' : 'secondary'}
      accessibilityState={{selected: on}}
      onPress={onPress}>
      <ButtonText>{label}</ButtonText>
    </Button>
  )
}

function ProjectRow({id, title, at}: {id: string; title: string; at: string}) {
  const t = useTheme()
  return (
    <Link to={`/docs/${id}`} label={`Doc ${title}`}>
      <View
        style={[
          a.flex_row,
          a.gap_md,
          a.p_md,
          a.border,
          a.rounded_md,
          a.align_center,
          t.atoms.border_contrast_low,
        ]}>
        <View
          style={[
            a.rounded_sm,
            a.align_center,
            a.justify_center,
            {width: 40, height: 40, backgroundColor: '#0b2a6b'},
          ]}>
          <Text style={[a.font_bold, {color: '#fff'}]}>Aa</Text>
        </View>
        <View style={[a.flex_1, {minWidth: 0}]}>
          <Text numberOfLines={1} style={[a.text_md, a.font_bold]}>
            {title}
          </Text>
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Doc · {new Date(at).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </Link>
  )
}

function ProjectsTab() {
  const t = useTheme()
  const docs = useDocs()
  return docs.length === 0 ? (
    <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 48}]}>
      <Text style={[a.text_lg, a.font_bold]}>Nenhum projeto ainda</Text>
      <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
        Crie um documento ou escolha um modelo para começar.
      </Text>
    </View>
  ) : (
    <View style={[a.gap_sm]}>
      {docs.map(doc => (
        <ProjectRow
          key={doc.id}
          id={doc.id}
          title={doc.title}
          at={doc.updatedAt}
        />
      ))}
    </View>
  )
}

function BrandTab() {
  const t = useTheme()
  return (
    <View style={[a.align_center, a.gap_sm, a.px_xl, {paddingTop: 48}]}>
      <Text style={[a.text_lg, a.font_bold]}>Kit de marca</Text>
      <Text
        style={[
          a.text_md,
          a.text_center,
          t.atoms.text_contrast_medium,
          {maxWidth: 420},
        ]}>
        Cores, fontes e logos do seu perfil ficarão aqui e aparecerão no painel
        Marca do editor. Chega junto com o editor de design.
      </Text>
    </View>
  )
}
