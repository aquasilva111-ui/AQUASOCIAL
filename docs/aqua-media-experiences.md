# AQUA Images and Videos

## Donor inspection and transplantation map

The supplied image archive is Pinterest-Flask (BSD-2-Clause, copyright 2021
Projjal Gop). Inspected: LICENSE, main.py, models.py, recommender.py,
static/js/main.js, static/css/style.css and _pin_cards.html. Its feed slices
24 records, maintains a shuffle seed across pagination, searches titles and
categories, saves image references, links creators, and recommends by category
or user similarity. Its SVD recommender reads interest/upload/visit data.

The supplied video ZIP does **not** match the HTML/JS donor described in the
request. It contains Next.js 15, tRPC, PostgreSQL/Drizzle and Mux. Inspected:
README.md, video-grid-card, video-thumbnail, video-player, video-section,
suggestions-section and video-view. No LICENSE/COPYING file was found in the
archive, so the stated MIT attribution cannot be verified from this ZIP.

No donor source, assets, databases, fonts or branding were copied. The following
behaviors were independently implemented using AQUA components:

| Donor concept | AQUA reuse | Change |
| --- | --- | --- |
| Image grid | Existing PostView and FeedPostSliceItem | MediaGallery masonry on web; adaptive virtualized rows on native |
| Video discovery | Existing feed query and media thumbnail | Same gallery, landscape thumbnail cards, no players in discovery |
| Pagination | usePostFeedQuery/useSearchPostsQuery/useBookmarksQuery | Shared next-page callbacks, bounded scan of empty media pages |
| Creator and reactions | PostMeta, PreviewableUserAvatar, PostControls | Shared MediaCard |
| Detail/watch | PostThread, ThreadItemAnchor, Embed | Media-first anchor, dedicated canonical routes, related media |
| Player | VideoEmbed/VideoEmbedInner web and native | Existing HLS/player controls retained |
| Search | useSearchPostsQuery | Same search cache and endpoint, media selection after moderation |
| Saved | Bookmarks API and mutation | Same relationship and optimistic post shadow |
| Categories | Existing record tags and rich-text facets | Horizontal topic selection from actual loaded posts |
| Recommendations | Current feed candidate ranking | Related tags/creator affinity in a pure service function |
| Upload | Existing composer/media pipeline | No second uploader required |
| Collections | Canonical URI/CID references | Shared ContentCollection contract only; no invented persistence |

Rejected: Flask server, donor identity/follow/save tables, pickled recommendation
models, whole-catalog scans/shuffles, Next.js routing, Mux service, donor auth,
database, fake records, placeholders and brand assets.

## Integration

Routes: `/images`, `/images/view/:name/:rkey`, `/videos`,
`/videos/watch/:name/:rkey`. `name` accepts the existing AT identity convention;
cards use author DID plus record key. Social URLs and existing routes remain.
Sidebar/drawer expose Images and Videos alongside existing navigation.

### Aqua Videos (Streamplace-backed video page)

The `/videos` screen follows the "Aqua Videos" design (YouTube-style home for
video on AQUA, powered by the Streamplace infrastructure vendored under
`streamplace/` plus its Go dependencies `atmoq/`, `glex/`, `muxl/`,
`RTCAudioDevice/`, `oatproxy/`, `atproto-oauth-golang/`, `cobalt/`):

- On web desktop the regular left nav is replaced by `VideosNavSidebar`
  (`src/screens/Media/VideosNavSidebar.tsx`): video sections (Paid
  Subscriptions, Subscriptions, Channels, History, Playlist, Watch Later,
  Collections), a Donate link, Trending Channels (suggested actors) and
  Trending videos (`useTrendingTopics`) with a country selector, plus footer
  links. The desktop right rail is hidden on the Videos route
  (`src/view/shell/createNativeStackNavigatorWithAuth.tsx`).
- The web header shows the Aqua logo, "Aqua Videos" title and a centered
  `SearchInput`; submitting switches to the search context.
- Sidebar links drive the screen through route params (`/videos?source=…`,
  `/videos?q=…`); `MediaHome` syncs `source`/`q` params into its local state.
- The video gallery is a 3-column grid on desktop web (2 below 1000px, 1 below
  480px) inside a widened center column (max 1200px); images mode keeps the
  previous 2-column masonry and 600px column.
- `MediaCard` renders the standard horizontal `PostControls` row under the
  author line, matching the design.

The Home selector uses the existing FeedExperienceProvider state. Its compact
30px trigger shows the current mode and chevron, now as a glassmorphism capsule
(fully rounded, translucent blur) placed beside the hashtag (feeds) button in
the desktop web header row; on smaller breakpoints and for guests it stays
centered below the tab bar. Web retains the six-option menu, keyboard
navigation, Escape and outside-click dismissal, with the menu aligned to the
header edge when opened from the top row. Mode is never part of the feed query
key. Images/Video use the same MediaGallery as dedicated pages. Selecting a
source or topic in a dedicated page is explicit and local.

When fresh posts arrive, an animated glass capsule pill (up arrow, stacked
author avatars, "posted") drops in at the top of the feed, mirroring the X
new-posts affordance; activating it scrolls up and loads the latest posts. It is
driven by `peekNewPosts` (a multi-post `peekLatest` on the feed APIs), falls
back to the previous load-latest button when no author data is available, and
respects the `remove_show_latest_button` gate.

Dedicated pages reuse current selected feed by default, with explicit discovery,
following, own media, saved and search contexts. Guests see only public contexts.
Posts retain original URI, CID, author, embed, labels and relationships. No
database, AT lexicon, authentication or source adapter was introduced.

MediaCard uses thumbnails and retains post shadow updates. Moderation filters
exclude hidden list/media content; blurs conceal both thumbnail and actions until
the existing moderation policy permits reveal. Thread details reuse the full
existing moderation pipeline, follow control, composer replies and interactions.

Related results exclude the current post, duplicates and filtered content. Tags
and creator affinity reorder only the related section, using source order as a
stable tie-breaker. This is not a new personalized recommendation engine.

`getVideoExperience` prioritizes explicit creator intent, then configurable
duration thresholds plus aspect ratio. Current AT embed views do not expose
reliable duration or a creator-selected mode, so these records classify as
`both`. No fabricated duration badge or view count is shown. A future metadata
adapter can supply these fields without changing cards or queries.

## Files and extension boundaries

Created: `src/lib/media/experiences.ts`, `src/screens/Media/*`,
`src/components/feeds/MediaCard.tsx`, `MediaGallery.tsx`, `MediaGallery.web.tsx`,
`media-gallery.css`, `FeedViewSwitcher.web.tsx`, `NewPostsPill.tsx`,
`NewPostsPill.web.tsx`, `new-posts-pill.css`,
`__tests__/lib/media-experiences.test.ts`.

Connected existing/in-progress experience files: `FeedViewSwitcher.tsx`,
`feed-experience.css`, `FeedExperienceRenderer.tsx`, `state/shell/selected-feed`,
`HomeHeader`, `FeedPage`, `PostFeed`. Updated routes/types/navigation,
desktop sidebar/right rail/drawer, thread anchor/detail slots and optional
query enablement for bookmarks. The checkout already contained other pending
feed/image/dock edits; they were retained.

Web cards mount only near the viewport, retain measured height while unmounted,
and fetch full images through the existing detail/lightbox interaction. Resize
observation drives masonry spans. Native uses the existing List virtualization,
adaptive columns and native image/player infrastructure. Existing animation and
reduced-motion behavior remains in the shell; the selector respects reduced motion.

Existing post impression tracking is reused. Playback remains in the existing
player; no parallel event store or watch-history system was added. Continue
watching/history require a shared persistence design and are not implemented.

## Limits

- Named collections have a type contract but no UI or server persistence because
  the current app only implements shared bookmarks.
- Native Images uses adaptive two-column rows, not independent-height masonry.
- Recommendations are bounded to available feed candidates, not semantic search.
- Long-form priority cannot be inferred accurately when duration is absent.
- Tags filter loaded candidates; they are not a new category database.
- Native runtime still requires validation on a device/simulator.
- Authentication-required mutations are reused; public browser checks do not
  validate writes on a signed-in account.
- No commit, push or Hostinger deployment is part of these local changes.

## Verification

Targeted tests cover unknown duration, long vertical video, creator priority,
configurable policy, moderation filtering, quote media, deduplication and stable
object identity. Typecheck and web production build are run locally. Browser
checks cover compact selector behavior, unchanged source, responsive discovery,
absence of players in grids, card layout and direct detail-route reloads.
