import { IFontFamily } from "~/interfaces/editor"
import { createAction } from "@reduxjs/toolkit"

export const setFonts = createAction<IFontFamily[]>("fonts/setFonts")
