import { Resource } from "~/interfaces/editor"
import { createAction } from "@reduxjs/toolkit"

export const setPixabayResources = createAction<Resource[]>("resources/setPixabayResources")
