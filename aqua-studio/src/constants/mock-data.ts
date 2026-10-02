import { AQUA } from "~/lib/brand"

const shapePreview = (inner: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${inner}</svg>`
  )}`

const base = { left: 0, top: 0, originX: "left", originY: "top", type: "StaticPath", metadata: {} }

/** Basic shapes drawn for AQUA. Users bring images through Uploads. */
export const graphics = [
  {
    ...base,
    id: "shape-square",
    width: 60,
    height: 60,
    scaleX: 4,
    scaleY: 4,
    path: [["M", 0, 0], ["L", 60, 0], ["L", 60, 60], ["L", 0, 60], ["Z"]],
    fill: AQUA.blue,
    preview: shapePreview(`<rect x="16" y="16" width="64" height="64" fill="${AQUA.blue}"/>`),
  },
  {
    ...base,
    id: "shape-circle",
    width: 60,
    height: 60,
    scaleX: 4,
    scaleY: 4,
    path: [
      ["M", 30, 0],
      ["C", 46.57, 0, 60, 13.43, 60, 30],
      ["C", 60, 46.57, 46.57, 60, 30, 60],
      ["C", 13.43, 60, 0, 46.57, 0, 30],
      ["C", 0, 13.43, 13.43, 0, 30, 0],
      ["Z"],
    ],
    fill: AQUA.orange,
    preview: shapePreview(`<circle cx="48" cy="48" r="32" fill="${AQUA.orange}"/>`),
  },
  {
    ...base,
    id: "shape-triangle",
    width: 60,
    height: 52,
    scaleX: 4,
    scaleY: 4,
    path: [["M", 30, 0], ["L", 60, 52], ["L", 0, 52], ["Z"]],
    fill: "#12a58a",
    preview: shapePreview(`<polygon points="48,14 82,76 14,76" fill="#12a58a"/>`),
  },
  {
    ...base,
    id: "shape-diamond",
    width: 60,
    height: 60,
    scaleX: 4,
    scaleY: 4,
    path: [["M", 30, 0], ["L", 60, 30], ["L", 30, 60], ["L", 0, 30], ["Z"]],
    fill: "#7b6cf6",
    preview: shapePreview(`<polygon points="48,12 84,48 48,84 12,48" fill="#7b6cf6"/>`),
  },
  {
    ...base,
    id: "shape-star",
    width: 60,
    height: 57,
    scaleX: 4,
    scaleY: 4,
    path: [["M", 30, 0], ["L", 38, 22], ["L", 60, 22], ["L", 42, 36], ["L", 49, 57], ["L", 30, 44], ["L", 11, 57], ["L", 18, 36], ["L", 0, 22], ["L", 22, 22], ["Z"]],
    fill: "#e0607e",
    preview: shapePreview(`<polygon points="48,10 57,37 86,37 62,54 71,82 48,65 25,82 34,54 10,37 39,37" fill="#e0607e"/>`),
  },
]
