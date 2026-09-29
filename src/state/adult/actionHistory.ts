/**
 * +18-local interaction signals.
 *
 * This is the ADULT recommendation profile: likes, seen posts, searches and
 * watch history produced inside /adult stay in this in-memory store and are
 * NEVER written to the social `userActionHistory`. The store is cleared on
 * explicit exit, on account switch and on logout (see `context.tsx`), so no
 * +18 signal can leak into social feeds, Discover ranking or suggestions.
 */

const WINDOW = 100

export type AdultActionHistory = {
  likes: string[]
  saves: string[]
  seen: string[]
  searches: string[]
  watched: string[]
}

const adultActionHistory: AdultActionHistory = {
  likes: [],
  saves: [],
  seen: [],
  searches: [],
  watched: [],
}

export function getAdultActionHistory(): AdultActionHistory {
  return adultActionHistory
}

function push(list: string[], values: string[]) {
  return list.concat(values).slice(-WINDOW)
}

export function likeAdult(uris: string[]) {
  adultActionHistory.likes = push(adultActionHistory.likes, uris)
}

export function unlikeAdult(uris: string[]) {
  adultActionHistory.likes = adultActionHistory.likes.filter(
    uri => !uris.includes(uri),
  )
}

export function saveAdult(uris: string[]) {
  adultActionHistory.saves = push(adultActionHistory.saves, uris)
}

export function unsaveAdult(uris: string[]) {
  adultActionHistory.saves = adultActionHistory.saves.filter(
    uri => !uris.includes(uri),
  )
}

export function seenAdult(uris: string[]) {
  adultActionHistory.seen = push(adultActionHistory.seen, uris)
}

export function searchAdult(terms: string[]) {
  adultActionHistory.searches = push(adultActionHistory.searches, terms)
}

export function watchedAdult(uris: string[]) {
  adultActionHistory.watched = push(adultActionHistory.watched, uris)
}

export function clearAdultActionHistory() {
  adultActionHistory.likes = []
  adultActionHistory.saves = []
  adultActionHistory.seen = []
  adultActionHistory.searches = []
  adultActionHistory.watched = []
}
