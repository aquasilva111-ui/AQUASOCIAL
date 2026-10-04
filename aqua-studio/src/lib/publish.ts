import { StudioFormat } from "./formats"

export type PublishMessage = {
  type: "aqua-studio:publish"
  format: StudioFormat["id"]
  publishTo: StudioFormat["publishTo"]
  width: number
  height: number
  /** PNG as a data URL. */
  png: string
}

/**
 * Sends the exported design to the AQUA app that embeds the Studio. The
 * message only goes to the origin given in ?host=, never "*". Without a host
 * (standalone) the PNG is downloaded instead.
 */
export function publishToAqua(opts: { host: string | null; format: StudioFormat; png: string; name: string }) {
  const { host, format, png, name } = opts
  const target = window.parent !== window ? window.parent : window.opener
  if (host && target) {
    const msg: PublishMessage = {
      type: "aqua-studio:publish",
      format: format.id,
      publishTo: format.publishTo,
      width: format.width,
      height: format.height,
      png,
    }
    target.postMessage(msg, host)
    return "sent" as const
  }
  const a = document.createElement("a")
  a.href = png
  a.download = `${name || "design"}.png`
  a.click()
  return "downloaded" as const
}
