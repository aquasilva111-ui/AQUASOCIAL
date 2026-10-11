/**
 * The installed tarball points `types` at `lib/typescript`, which is not
 * published in the git dependency. These are the surfaces the composer uses.
 */
declare module '@mattermost/react-native-paste-input' {
  import {type ComponentType, type RefAttributes} from 'react'
  import {type TextInputProps} from 'react-native'

  export interface PastedFile {
    uri: string
    fileName?: string
    fileSize?: number
    type?: string
  }

  export interface PasteTextInputInstance {
    focus: () => void
    blur: () => void
  }

  export interface PasteInputProps extends TextInputProps {
    onPaste?: (error: string | null | undefined, files: PastedFile[]) => void
  }

  const PasteInput: ComponentType<
    PasteInputProps & RefAttributes<PasteTextInputInstance>
  >
  export default PasteInput
}
