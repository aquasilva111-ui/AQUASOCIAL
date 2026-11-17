# Hostinger web deployment

Use these settings for the React website:

- Framework: React
- Root directory: `./`
- Package manager: npm
- Build command: `npm run build`
- Output directory: `web-build`
- Node: 22.x

`npm run build` compiles the checked-in Lingui translation catalogs, exports the
website with Webpack, and runs the existing web post-build script. Do not run
Expo native prebuild on the web host: it generates Android/iOS projects and
requires native-only configuration such as `google-services.json`.

For native development, use `yarn native:prebuild`. The previous EAS build
workflow is available as `yarn build:native`.

After deployment, verify both the home page and a directly opened client route
such as `/search`; the host must serve `index.html` for client-side routes.
The post-build script copies `web/.htaccess` into `web-build` to configure this
fallback on Hostinger while preserving static asset requests.

`node scripts/emit-public-web.js` (also run by the post-build script) writes
`robots.txt`, `sitemap.xml`, `sitemaps/*.xml`, `llms.txt`, `index.md`,
`404.html`, `about.html`, `contact.html`, and `logo.png` from
`src/lib/public-site.ts`. Change `CONTENT_SIGNAL` in that module to update the
robots.txt line. Hostinger is a static Apache host: Markdown negotiation,
the homepage `Link` alternate header, and HTTP 404s are done in `web/.htaccess`
(`mod_rewrite`, `mod_headers`). A request is served as a real file when one
exists, known app prefixes fall back to `index.html`, and every other path
returns 404 with `404.html`. Deep links under those prefixes (`/profile/...`,
`/visionboard/...`, `/books/...`, `/views/...`) keep working. Apache cannot
tell an unknown profile from a real one, so those URLs still return the SPA.
`/videos/...` redirects to `/views/...`. `/about` and `/contact` are static
HTML pages. The homepage returns `index.md` (same text as `llms.txt`) when
`Accept` contains `text/markdown`, and adds
`Link: </llms.txt>; rel="alternate"; type="text/markdown"`.
