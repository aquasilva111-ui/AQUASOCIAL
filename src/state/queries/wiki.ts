import {keepPreviousData, useQuery} from '@tanstack/react-query'

import {fetchEntry, searchEntries} from '#/lib/wiki/api'

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
