import {useState} from 'react'
import {Image, Linking, Pressable, StyleSheet, Text, View} from 'react-native'
import Svg, {Circle, Polyline} from 'react-native-svg'

import {type SourceEntry} from '#/lib/wiki/sources'
import {
  type Country,
  formatValue,
  INDICATORS,
  PROVIDER_NAMES,
  providersFor,
  STATS_LICENSE,
} from '#/lib/wiki/stats'
import {
  useApod,
  useCompound,
  useCountries,
  useCountry,
  useNasaSearch,
  useSeries,
} from '#/state/queries/wiki'
import {bliss} from './theme'
import {Glass, GlossyButton, s} from './WikiHome'

function EntryCard({entry}: {entry: SourceEntry}) {
  return (
    <Glass style={s.card}>
      {entry.image && (
        <Image
          source={{uri: entry.image}}
          accessibilityIgnoresInvertColors
          accessibilityLabel={entry.title}
          accessibilityHint=""
          style={p.image}
        />
      )}
      <Text style={s.small}>{entry.source}</Text>
      <Text style={s.title} accessibilityRole="header">
        {entry.title}
      </Text>
      {!!entry.summary && <Text style={s.body}>{entry.summary}</Text>}
      {entry.facts.map(([label, value]) => (
        <Text key={label} style={s.body}>
          {label}: {value}
        </Text>
      ))}
      <Text style={s.small}>
        Fonte: {entry.source} · {entry.license}
      </Text>
      <GlossyButton
        label="Abrir fonte"
        colors={bliss.pill}
        onPress={() => Linking.openURL(entry.url)}
      />
    </Glass>
  )
}

export function NasaPanel({query}: {query: string}) {
  const [apod, setApod] = useState(false)
  const search = useNasaSearch(query)
  const day = useApod(apod)
  const entries = apod ? (day.data ? [day.data] : []) : (search.data ?? [])
  const loading = apod ? day.isLoading : search.isLoading
  const failed = apod ? day.isError : search.isError
  return (
    <>
      <View style={s.chips}>
        <GlossyButton
          label="Imagem do dia"
          colors={bliss.go}
          on={apod}
          onPress={() => setApod(v => !v)}
        />
      </View>
      {loading && <Text style={s.body}>A carregar…</Text>}
      {failed && (
        <Text style={s.body}>Não deu para ligar à NASA. Tenta de novo.</Text>
      )}
      {entries.slice(0, 6).map(e => (
        <EntryCard key={e.id} entry={e} />
      ))}
    </>
  )
}

export function MoleculePanel({query}: {query: string}) {
  const compound = useCompound(query)
  if (query.trim().length < 2) return null
  if (compound.isLoading) return <Text style={s.body}>A procurar…</Text>
  if (compound.isError)
    return (
      <Text style={s.body}>Não deu para ligar ao PubChem. Tenta de novo.</Text>
    )
  return compound.data ? (
    <EntryCard entry={compound.data} />
  ) : (
    <Text style={s.body}>Composto não encontrado. Tenta o nome em inglês.</Text>
  )
}

function Sparkline({points}: {points: {year: number; value: number}[]}) {
  const w = 300
  const h = 90
  const xs = points.map(pt => pt.year)
  const ys = points.map(pt => pt.value)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x: number) => 6 + ((x - x0) / Math.max(1, x1 - x0)) * (w - 12)
  const py = (y: number) =>
    h - 8 - ((y - y0) / Math.max(1e-9, y1 - y0)) * (h - 16)
  const last = points[points.length - 1]
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <Polyline
        points={points.map(pt => `${px(pt.year)},${py(pt.value)}`).join(' ')}
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.5}
      />
      <Circle
        cx={px(last.year)}
        cy={py(last.value)}
        r={4}
        fill={bliss.grassTop}
      />
    </Svg>
  )
}

function Stat({country}: {country: Country}) {
  const [indicatorId, setIndicatorId] = useState(INDICATORS[0].id)
  const [provider, setProvider] = useState<string | undefined>()
  const indicator = INDICATORS.find(i => i.id === indicatorId) ?? INDICATORS[0]
  const options = providersFor(indicator, country.iso3)
  const active = options.find(o => o === provider) ?? options[0]
  const series = useSeries(active, indicator, country.iso3)
  const pts = series.data ?? []
  const last = pts[pts.length - 1]
  return (
    <Glass style={s.card}>
      <Text style={s.small}>
        {country.iso3} · {country.region ?? ''}
      </Text>
      <Text style={s.title} accessibilityRole="header">
        {country.name}
      </Text>
      {!!country.capital && (
        <Text style={s.body}>Capital: {country.capital}</Text>
      )}
      {!!country.income && (
        <Text style={s.body}>Rendimento: {country.income}</Text>
      )}
      <View style={s.chips}>
        {INDICATORS.map(i => (
          <GlossyButton
            key={i.id}
            label={i.label}
            colors={bliss.pill}
            on={i.id === indicator.id}
            onPress={() => setIndicatorId(i.id)}
          />
        ))}
      </View>
      {series.isLoading && <Text style={s.body}>A carregar…</Text>}
      {series.isError && (
        <Text style={s.body}>
          Não deu para carregar os dados. Tenta de novo.
        </Text>
      )}
      {last && (
        <>
          <Text style={s.title}>{formatValue(last.value, indicator.unit)}</Text>
          <Text style={s.small}>
            {last.year} · desde {pts[0].year}
          </Text>
          {pts.length > 1 && <Sparkline points={pts} />}
        </>
      )}
      {series.isSuccess && !last && (
        <Text style={s.body}>Sem dados para este indicador.</Text>
      )}
      <View style={s.chips}>
        {options.map(o => (
          <GlossyButton
            key={o}
            label={PROVIDER_NAMES[o]}
            colors={bliss.go}
            on={o === active}
            onPress={() => setProvider(o)}
          />
        ))}
      </View>
      <Text style={s.small}>
        Fonte: {PROVIDER_NAMES[active]} · {STATS_LICENSE}
      </Text>
    </Glass>
  )
}

export function CountryPanel({query}: {query: string}) {
  const [iso3, setIso3] = useState<string | undefined>()
  const hits = useCountries(query)
  const country = useCountry(iso3)
  return (
    <>
      {!iso3 &&
        hits.data?.map(c => (
          <Pressable
            key={c.iso3}
            accessibilityRole="button"
            accessibilityHint="Abre os dados do país"
            onPress={() => setIso3(c.iso3)}
            style={s.hit}>
            <Text style={s.hitTitle}>{c.name}</Text>
          </Pressable>
        ))}
      {iso3 && country.data && (
        <>
          <Stat country={country.data} />
          <GlossyButton
            label="Voltar"
            colors={bliss.pill}
            onPress={() => setIso3(undefined)}
          />
        </>
      )}
      {iso3 && country.isLoading && <Text style={s.body}>A carregar…</Text>}
    </>
  )
}

const p = StyleSheet.create({
  image: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
})
