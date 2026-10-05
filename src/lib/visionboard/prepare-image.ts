import {type PickerImage} from '#/lib/media/picker.shared'

/** Native has no drag-and-drop source files; see ImageDropZone. */
export async function fileToPickerImage(_file: Blob): Promise<PickerImage> {
  throw new Error('fileToPickerImage is only available on web')
}
