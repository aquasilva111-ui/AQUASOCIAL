import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import {
  AQUA,
  AQUA_GRADIENTS,
  FabricRenderer,
  addTitle,
  createAquaDocument,
  linearGradient,
  solid
} from '../src/index'

const doc = createAquaDocument('post')
const { graph, artboard } = doc
graph.updateNode(artboard.id, { fills: [linearGradient(AQUA_GRADIENTS[1].stops)] })

const title = addTitle(doc, 'Bem-vinda ao Aqua')
graph.updateNode(title.id, { fills: [solid(AQUA.white)] })

graph.createNode('ELLIPSE', artboard.id, {
  x: 700, y: 640, width: 300, height: 300, fills: [solid(AQUA.orange)],
  effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 12 }, radius: 24, spread: 0, visible: true }]
})
graph.createNode('ROUNDED_RECTANGLE', artboard.id, {
  x: 86, y: 640, width: 520, height: 300, cornerRadius: 36, fills: [solid(AQUA.white)],
  strokes: [{ color: { r: 0, g: 0.17, b: 0.94, a: 1 }, weight: 6, opacity: 1, visible: true, align: 'INSIDE' }]
})

const r = new FabricRenderer(graph, document.getElementById('c') as HTMLCanvasElement, {
  interactive: true, width: 1160, height: 1160
})
await document.fonts.load('700 80px Inter')
r.showPage(doc.pageId)
document.getElementById('png')!.onclick = () => {
  const a = document.createElement('a')
  a.href = r.toDataURL(1)
  a.download = 'aqua-design.png'
  a.click()
}
;(window as any).r = r
