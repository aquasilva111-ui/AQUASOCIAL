import {keepPreviousData, useQuery} from '@tanstack/react-query'

import {
  fetchApod,
  fetchCompound,
  fetchCountry,
  fetchEntry,
  fetchSeries,
  searchCountries,
  searchEntries,
  searchNasa,
} from '#/lib/wiki/api'
import {type Indicator, type Provider} from '#/lib/wiki/stats'

const STALE = 1000 * 60 * 30

export function useWikiSearch(lang: string, query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['wiki', 'search', lang, q],
    queryFn: ({signal}) => searchEntries(lang, q, signal),
    enabled: q.length >= 2,
    staleTime: STALE,
    placeholderData: keepPreviousData,
  })
}

export function useWikiEntry(lang: string, title: string | undefined) {
  return useQuery({
    queryKey: ['wiki', 'entry', lang, title],
    queryFn: ({signal}) => fetchEntry(lang, title!, signal),
    enabled: !!title,
    staleTime: STALE,
  })
}

export function useNasaSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['wiki', 'nasa', q],
    queryFn: ({signal}) => searchNasa(q, signal),
    enabled: q.length >= 2,
    staleTime: STALE,
  })
}

export function useApod(enabled: boolean) {
  return useQuery({
    queryKey: ['wiki', 'apod', new Date().toISOString().slice(0, 10)],
    queryFn: ({signal}) => fetchApod(signal),
    enabled,
    staleTime: STALE,
  })
}

export function useCompound(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['wiki', 'compound', q.toLowerCase()],
    queryFn: ({signal}) => fetchCompound(q, signal),
    enabled: q.length >= 2,
    staleTime: STALE,
  })
}

export function useCountries(query: string) {
  return useQuery({
    queryKey: ['wiki', 'countries'],
    queryFn: ({signal}) => searchCountries(signal),
    staleTime: STALE * 48,
    select: all => {
      const q = query.trim().toLowerCase()
      return q.length < 2
        ? []
        : all.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8)
    },
  })
}

export function useCountry(iso3: string | undefined) {
  return useQuery({
    queryKey: ['wiki', 'country', iso3],
    queryFn: ({signal}) => fetchCountry(iso3!, signal),
    enabled: !!iso3,
    staleTime: STALE * 48,
  })
}

export function useSeries(
  provider: Provider,
  indicator: Indicator,
  iso3: string | undefined,
) {
  return useQuery({
    queryKey: ['wiki', 'series', provider, indicator.id, iso3],
    queryFn: ({signal}) => fetchSeries(provider, indicator, iso3!, signal),
    enabled: !!iso3,
    staleTime: STALE * 4,
  })
}
