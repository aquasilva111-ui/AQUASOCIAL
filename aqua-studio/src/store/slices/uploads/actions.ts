import { IUpload, Uploading } from "~/interfaces/editor"
import { createAsyncThunk, createAction } from "@reduxjs/toolkit"
import { localUploads } from "~/services/local"

export const setUploads = createAction<IUpload[]>("uploads/setUploads")
export const setUploading = createAction<Uploading>("uploads/setUploading")
export const closeUploading = createAction("uploads/closeUploading")

export const getUploads = createAsyncThunk<void, never, { rejectValue: Record<string, string[]> }>(
  "uploads/getUploads",
  async (_, { dispatch }) => {
    dispatch(setUploads(localUploads.list()))
  }
)

export const uploadFile = createAsyncThunk<void, { file: File }, any>("uploads/uploadFile", async (args, { dispatch }) => {
  dispatch(setUploading({ progress: 0, status: "IN_PROGRESS" }))
  try {
    const uploaded = await localUploads.add(args.file)
    dispatch(setUploads([uploaded]))
  } finally {
    dispatch(closeUploading())
  }
})
