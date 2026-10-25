/** Route names that render the Aqua Views shell (not the social dock's pages). */
const AQUA_VIEWS_ROUTES = new Set([
  'Videos',
  'VideosLegacy',
  'VideoWatch',
  'VideoWatchLegacy',
  'VideoLive',
  'VideoGoLive',
  'ViewChannel',
  'ViewChannelCreate',
  'ViewChannelLegacy',
  'ViewStudio',
  'ViewStudioCustomize',
  'ViewPaid',
  'ViewSubscriptions',
  'ViewMyVideos',
  'ViewChannels',
  'ViewHistory',
  'ViewPlaylists',
  'ViewCollections',
  'ViewWatchLater',
  'ViewLive',
  'ViewList',
])

export function isAquaViewsRoute(name: string | undefined) {
  return !!name && AQUA_VIEWS_ROUTES.has(name)
}
