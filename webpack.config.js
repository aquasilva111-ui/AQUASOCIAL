const path = require('path')
const webpack = require('webpack')
const createExpoWebpackConfigAsync = require('@expo/webpack-config')
const {withAlias} = require('@expo/webpack-config/addons')
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin')
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer')
const {sentryWebpackPlugin} = require('@sentry/webpack-plugin')
const {version} = require('./package.json')

const GENERATE_STATS = process.env.EXPO_PUBLIC_GENERATE_STATS === '1'
const OPEN_ANALYZER = process.env.EXPO_PUBLIC_OPEN_ANALYZER === '1'

const reactNativeWebWebviewConfiguration = {
  test: /postMock.html$/,
  use: {
    loader: 'file-loader',
    options: {
      name: '[name].[ext]',
    },
  },
}

// The composer uses Tiptap v2 while BlockNote (AQUA DOCS) ships Tiptap v3.
// npm may hoist some v3 extensions to the top-level node_modules, where they
// would resolve the app's v2 @tiptap/core and @tiptap/pm. Resolve @tiptap/core and
// @tiptap/pm imports made by those v3 packages from BlockNote's copy instead.
const TIPTAP_V3_BASE = path.join(__dirname, 'node_modules/@blocknote/core')
const TIPTAP_HOISTED_DIR = path.join(__dirname, 'node_modules/@tiptap')
const tiptapMajorCache = new Map()
function tiptapMajor(dir) {
  if (!tiptapMajorCache.has(dir)) {
    let major = null
    try {
      major = require(path.join(dir, 'package.json')).version.split('.')[0]
    } catch {}
    tiptapMajorCache.set(dir, major)
  }
  return tiptapMajorCache.get(dir)
}
const tiptapV3Resolution = new webpack.NormalModuleReplacementPlugin(
  /^@tiptap\/(core|pm)(\/|$)/,
  resource => {
    const context = resource.context || ''
    if (!context.startsWith(TIPTAP_HOISTED_DIR + path.sep)) return
    const pkgName = context
      .slice(TIPTAP_HOISTED_DIR.length + 1)
      .split(path.sep)[0]
    if (tiptapMajor(path.join(TIPTAP_HOISTED_DIR, pkgName)) === '3') {
      resource.context = TIPTAP_V3_BASE
    }
  },
)

module.exports = async function (env, argv) {
  let config = await createExpoWebpackConfigAsync(env, argv)
  config = withAlias(config, {
    'react-native$': 'react-native-web',
    'react-native-webview': 'react-native-web-webview',
    // Force ESM version
    'unicode-segmenter/grapheme': require
      .resolve('unicode-segmenter/grapheme')
      .replace(/\.cjs$/, '.js'),
  })
  config.module.rules = [
    ...(config.module.rules || []),
    reactNativeWebWebviewConfiguration,
  ]
  config.plugins.push(tiptapV3Resolution)
  if (env.mode === 'development') {
    config.plugins.push(new ReactRefreshWebpackPlugin())
  } else {
    // Support static CDN for chunks
    config.output.publicPath = 'auto'
  }

  if (GENERATE_STATS || OPEN_ANALYZER) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        openAnalyzer: OPEN_ANALYZER,
        generateStatsFile: true,
        statsFilename: '../stats.json',
        analyzerMode: OPEN_ANALYZER ? 'server' : 'json',
        defaultSizes: 'parsed',
      }),
    )
  }
  if (process.env.SENTRY_AUTH_TOKEN) {
    config.plugins.push(
      sentryWebpackPlugin({
        org: 'blueskyweb',
        project: 'app',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          // fallback needed for Render.com deployments
          name: process.env.SENTRY_RELEASE || version,
          dist: process.env.SENTRY_DIST,
        },
      }),
    )
  }
  return config
}
