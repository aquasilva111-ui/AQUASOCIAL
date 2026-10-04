import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US'
import '@univerjs/preset-sheets-core/lib/index.css'

const t0 = performance.now()
const { univerAPI } = createUniver({
  locale: LocaleType.EN_US,
  locales: { [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS) },
  presets: [UniverSheetsCorePreset({ container: 'app' })]
})
const wb = univerAPI.createWorkbook({ name: 'Teste' })
wb.getActiveSheet().getRange('A1:B2').setValues([[1, 2], [3, '=A1+B1']])
;(window as any).__boot = { ms: Math.round(performance.now() - t0), sum: wb.getActiveSheet().getRange('B2').getValue() }
