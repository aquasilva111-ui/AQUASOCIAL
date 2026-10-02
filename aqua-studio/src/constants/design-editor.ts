import { nanoid } from "nanoid"
import { IFrame, IScene } from "@layerhub-io/types"

export const defaultTemplate: IScene = {
  id: nanoid(),
  frame: {
    width: 1200,
    height: 1200,
  },
  layers: [
    {
      id: "background",
      name: "Initial Frame",
      left: 0,
      top: 0,
      width: 1200,
      height: 1200,
      type: "Background",
      fill: "#ffffff",
      metadata: {},
    },
  ],
  metadata: {},
}

export const getDefaultTemplate = ({ width, height }: IFrame) => {
  return {
    id: nanoid(),
    frame: {
      width,
      height,
    },
    layers: [
      {
        id: "background",
        name: "Initial Frame",
        left: 0,
        top: 0,
        width,
        height,
        type: "Background",
        fill: "#ffffff",
        metadata: {},
      },
    ],
    metadata: {},
  }
}

const effectPreview = () =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#eff2f6"/><text x="48" y="60" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="36" fill="#0f172a">Aa</text></svg>'
  )}`

export const TEXT_EFFECTS = [
  {
    id: 1,
    name: "None",
    preview: effectPreview(),
  },
  {
    id: 2,
    name: "Shadow",
    preview: effectPreview(),
  },
  {
    id: 3,
    name: "Lift",
    preview: effectPreview(),
  },
  {
    id: 4,
    name: "Hollow",
    preview: effectPreview(),
  },
  {
    id: 5,
    name: "Splice",
    preview: effectPreview(),
  },
  {
    id: 6,
    name: "Neon",
    preview: effectPreview(),
  },
]
