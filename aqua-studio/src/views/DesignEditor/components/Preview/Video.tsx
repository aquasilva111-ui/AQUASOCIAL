import { Block } from "baseui/block"

/**
 * The original editor sent the design to a third-party render service here.
 * AQUA never sends designs to outside servers; video preview and render come
 * back with the AQUA video editor (phase 4).
 */
const Video = () => {
  return (
    <Block $style={{ flex: 1, alignItems: "center", justifyContent: "center", display: "flex", padding: "5rem", textAlign: "center" }}>
      A pré-visualização de vídeo chega com o editor de vídeo do Aqua.
    </Block>
  )
}

export default Video
