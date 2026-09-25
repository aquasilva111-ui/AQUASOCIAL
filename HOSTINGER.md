# Hostinger web deployment

Use these settings for the React website:

- Framework: React
- Root directory: `./`
- Package manager: Yarn
- Build command: `yarn run build`
- Output directory: `web-build`
- Node: 20.x (20.19 or newer)

`yarn build` compiles the checked-in Lingui translation catalogs, exports the
website with Webpack, and runs the existing web post-build script. Do not run
Expo native prebuild on the web host: it generates Android/iOS projects and
requires native-only configuration such as `google-services.json`.

For native development, use `yarn native:prebuild`. The previous EAS build
workflow is available as `yarn build:native`.

After deployment, verify both the home page and a directly opened client route
such as `/search`; the host must serve `index.html` for client-side routes.
