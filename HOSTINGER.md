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
such as `/search`; the host must serve the corresponding generated HTML for known client routes.
The post-build script generates `web-build/.htaccess` for static Hostinger
deploys while preserving static asset requests. It also copies `web/robots.txt`,
`web/sitemap.xml`, and `web/sitemaps/*.xml`. Those files are real files in the
export, so Apache serves them. A missing `.txt` or `.xml` is not rewritten to
`index.html`.

## Agent discovery and MCP

The web build copies the static `robots.txt` and sitemap index, and generates
llms.txt, the Markdown homepage, and page metadata from `web/site-info.js`.
Apache-compatible static serving uses the generated `web-build/.htaccess` rules
for public pages, Markdown, and HTTP 404s. The route allowlist comes from
`src/routes.ts`. Unrecognized app paths return HTTP 404. A recognized dynamic
path may still display an in-app error if the upstream record does not exist.

To expose the public MCP endpoint and its discovery card, run the existing Node
HTTP server behind the domain instead of the static React preset. Use the
`Other` framework preset on Hostinger with Node 22.x, project root `./`,
npm, build command `npm run build`, and entry file `server.js` (or start command
`npm start` where applicable). Route requests through the Node entry point so
homepage negotiation and the MCP paths reach it. Validate this configuration on
a preview before switching production.

The MCP card is served at `/.well-known/mcp/server-card.json`. It points to the
stateless Streamable HTTP endpoint at `/mcp`, which exposes one read-only tool
returning the public site guide. WebMCP exposes the same guide in browsers with
the API enabled. Run `node --test scripts/test-site-discovery.js` to validate
the generated files and exercise both MCP interfaces with Node 22.
