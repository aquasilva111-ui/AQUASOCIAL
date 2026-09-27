import {
  createContext,
  type PropsWithChildren,
  useContext,
  useState,
} from 'react'

export const FEED_EXPERIENCE_MODES = [
  'social',
  'streams',
  'drops',
  'video',
  'images',
  'editorial',
] as const

export type FeedExperienceMode = (typeof FEED_EXPERIENCE_MODES)[number]

const StateContext = createContext<FeedExperienceMode>('social')
const SetContext = createContext<(mode: FeedExperienceMode) => void>(() => {})

// This is presentation state only: never include it in a feed query key.
export function FeedExperienceProvider({children}: PropsWithChildren) {
  const [experienceMode, setExperienceMode] =
    useState<FeedExperienceMode>('social')
  return (
    <StateContext.Provider value={experienceMode}>
      <SetContext.Provider value={setExperienceMode}>
        {children}
      </SetContext.Provider>
    </StateContext.Provider>
  )
}

export function useFeedExperience() {
  return useContext(StateContext)
}

export function useSetFeedExperience() {
  return useContext(SetContext)
}
