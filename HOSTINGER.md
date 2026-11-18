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
fallback on Hostinger while preserving static asset requests. It also copies
`web/robots.txt`, `web/sitemap.xml`, and `web/sitemaps/*.xml`. Those files are
real files in the export, so Apache serves them. `.txt` and `.xml` requests
that do not match a file stay out of the `index.html` fallback.
