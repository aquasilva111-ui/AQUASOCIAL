import i18next from "i18next"

import editor_pt from "./pt/editor.json"

i18next.init({
  interpolation: { escapeValue: false },
  lng: "pt",
  fallbackLng: "pt",
  resources: {
    pt: {
      editor: editor_pt,
    },
  },
})
