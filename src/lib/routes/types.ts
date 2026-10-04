import {type NavigationState, type PartialState} from '@react-navigation/native'
import {type NativeStackNavigationProp} from '@react-navigation/native-stack'

import {type VideoFeedSourceContext} from '#/screens/VideoFeed/types'

export type {NativeStackScreenProps} from '@react-navigation/native-stack'

export type CommonNavigatorParams = {
  NotFound: undefined
  Lists: undefined
  Moderation: undefined
  ModerationModlists: undefined
  ModerationMutedAccounts: undefined
  ModerationBlockedAccounts: undefined
  ModerationInteractionSettings: undefined
  ModerationVerificationSettings: undefined
  Settings: undefined
  Profile: {name: string; hideBackButton?: boolean}
  ProfileFollowers: {name: string}
  ProfileFollows: {name: string}
  ProfileKnownFollowers: {name: string}
  ProfileSearch: {name: string; q?: string}
  ProfileList: {name: string; rkey: string}
  PostThread: {name: string; rkey: string}
  PostLikedBy: {name: string; rkey: string}
  PostRepostedBy: {name: string; rkey: string}
  PostQuotes: {name: string; rkey: string}
  ProfileFeed: {
    name: string
    rkey: string
    feedCacheKey?: 'discover' | 'explore' | undefined
  }
  ProfileFeedLikedBy: {name: string; rkey: string}
  ProfileLabelerLikedBy: {name: string}
  Debug: undefined
  DebugMod: undefined
  SharedPreferencesTester: undefined
  Log: undefined
  Support: undefined
  PrivacyPolicy: undefined
  TermsOfService: undefined
  CommunityGuidelines: undefined
  CopyrightPolicy: undefined
  LanguageSettings: undefined
  AppPasswords: undefined
  SavedFeeds: undefined
  PreferencesFollowingFeed: undefined
  PreferencesThreads: undefined
  PreferencesExternalEmbeds: undefined
  AccessibilitySettings: undefined
  AppearanceSettings: undefined
  AccountSettings: undefined
  PrivacyAndSecuritySettings: undefined
  ActivityPrivacySettings: undefined
  ContentAndMediaSettings: undefined
  NotificationSettings: undefined
  ReplyNotificationSettings: undefined
  MentionNotificationSettings: undefined
  QuoteNotificationSettings: undefined
  LikeNotificationSettings: undefined
  RepostNotificationSettings: undefined
  NewFollowerNotificationSettings: undefined
  LikesOnRepostsNotificationSettings: undefined
  RepostsOnRepostsNotificationSettings: undefined
  ActivityNotificationSettings: undefined
  MiscellaneousNotificationSettings: undefined
  InterestsSettings: undefined
  AboutSettings: undefined
  AppIconSettings: undefined
  Search: {q?: string; tab?: 'user' | 'profile' | 'feed'}
  Hashtag: {tag: string; author?: string}
  Topic: {topic: string}
  MessagesConversation: {conversation: string; embed?: string; accept?: true}
  MessagesSettings: undefined
  MessagesInbox: undefined
  NotificationsActivityList: {posts: string}
  LegacyNotificationSettings: undefined
  Feeds: undefined
  Start: {name: string; rkey: string}
  StarterPack: {name: string; rkey: string; new?: boolean}
  StarterPackShort: {code: string}
  StarterPackWizard: {
    fromDialog?: boolean
    targetDid?: string
    onSuccess?: () => void
  }
  StarterPackEdit: {rkey?: string}
  VideoFeed: VideoFeedSourceContext
  Bookmarks: undefined
  Images: {source?: string; q?: string} | undefined
  ImagesLegacy: undefined
  Videos: {source?: string; q?: string} | undefined
  VideosLegacy: undefined
  VideoLive: {name: string}
  VideoGoLive: undefined
  ViewChannelCreate: undefined
  ViewChannel: {handle: string}
  ViewChannelLegacy: {handle: string}
  ViewStudio: undefined
  ViewStudioCustomize: undefined
  ViewPaid: undefined
  ViewSubscriptions: undefined
  ViewMyVideos: undefined
  ViewChannels: undefined
  ViewHistory: undefined
  ViewPlaylists: undefined
  ViewCollections: undefined
  ViewWatchLater: undefined
  ViewLive: undefined
  ViewList: {kind: string; name: string; rkey: string}
  Music: undefined
  Reads: undefined
  Books: undefined
  BooksStudio: undefined
  BookEdit: {book: string}
  ChapterEdit: {book: string; chapter: string}
  BookDetail: {handle: string; book: string}
  BookChapter: {handle: string; book: string; chapter: string}
  LaunchHub: undefined
  LaunchNew: {id?: string} | undefined
  LaunchDetail: {id: string}
  CreativeHub: undefined
  CreativeHubTab: {tab: string}
  UIAI: undefined
  DocsHome: undefined
  DocEditor: {id: string}
  AdultHome: undefined
  AdultFeed: undefined
  AdultCreators: undefined
  AdultCreator: {name: string}
  AdultViews: undefined
  AdultVideo: {videoId: string}
  AdultLive: undefined
  AdultLiveStream: {streamId: string}
  AdultStudios: undefined
  AdultStudio: {handle: string}
  AdultTitle: {type: 'movie' | 'series'; id: string}
  AdultLibrary: undefined
  AdultDrops: undefined
  AdultVisionboard: undefined
  AdultReads: undefined
  AdultRead: {bookId: string}
  AdultMessages: undefined
  AdultSettings: undefined
  AdultCreatorDashboard: undefined
  ImageDetail: {name: string; rkey: string}
  ImageDetailLegacy: {name: string; rkey: string}
  /** `t`: share-at-time start position ("192", "3m12s"). */
  VideoWatch: {name: string; rkey: string; t?: string}
  VideoWatchLegacy: {name: string; rkey: string; t?: string}
}

export type BottomTabNavigatorParams = CommonNavigatorParams & {
  HomeTab: undefined
  SearchTab: undefined
  DropsTab: undefined
  NotificationsTab: undefined
  MyProfileTab: undefined
  MessagesTab: undefined
}

export type HomeTabNavigatorParams = CommonNavigatorParams & {
  Home: undefined
}

export type SearchTabNavigatorParams = CommonNavigatorParams & {
  Search: {q?: string; tab?: 'user' | 'profile' | 'feed'}
}

export type DropsTabNavigatorParams = CommonNavigatorParams & {
  Drops: undefined
}

export type NotificationsTabNavigatorParams = CommonNavigatorParams & {
  Notifications: undefined
}

export type MyProfileTabNavigatorParams = CommonNavigatorParams & {
  MyProfile: {name: 'me'; hideBackButton: true}
}

export type MessagesTabNavigatorParams = CommonNavigatorParams & {
  Messages: {pushToConversation?: string; animation?: 'push' | 'pop'}
}

export type FlatNavigatorParams = CommonNavigatorParams & {
  Home: undefined
  Drops: undefined
  Search: {q?: string; tab?: 'user' | 'profile' | 'feed'}
  Feeds: undefined
  Notifications: undefined
  Messages: {pushToConversation?: string; animation?: 'push' | 'pop'}
}

export type AllNavigatorParams = CommonNavigatorParams & {
  HomeTab: undefined
  Home: undefined
  SearchTab: undefined
  DropsTab: undefined
  Drops: undefined
  Search: {q?: string; tab?: 'user' | 'profile' | 'feed'}
  Feeds: undefined
  NotificationsTab: undefined
  Notifications: undefined
  MyProfileTab: undefined
  MessagesTab: undefined
  Messages: {animation?: 'push' | 'pop'}
}

// NOTE
// this isn't strictly correct but it should be close enough
// a TS wizard might be able to get this 100%
// -prf
export type NavigationProp = NativeStackNavigationProp<AllNavigatorParams>

export type State =
  | NavigationState
  | Omit<PartialState<NavigationState>, 'stale'>

export type RouteParams = Record<string, string>
export type MatchResult = {params: RouteParams}
export type Route = {
  match: (path: string) => MatchResult | undefined
  build: (params?: Record<string, any>) => string
}
