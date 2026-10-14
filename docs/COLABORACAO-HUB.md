# Colaboração em tempo real e persistência no Hub

O Docs já tem Yjs + y-indexeddb + y-webrtc funcionando.  
Este guia mostra como expandir o mesmo padrão para o Hub (música, vídeo, design) e ter um fluxo simples de “salvar no perfil / publicar como post”.

---

## Estado atual

| Parte                  | Situação                                      |
|------------------------|-----------------------------------------------|
| Docs                   | Yjs + y-indexeddb + y-webrtc pronto           |
| Runtime (`aqua-runtime`) | `CollabTransport` + `MemoryHub` + adapters   |
| Hub                    | Ainda não tem colab em tempo real             |
| Publicar no perfil     | Docs já envia `postMessage` (ver `publish.ts`) |

---

## 1. Transporte de rede simples (reutilizável)

O runtime já tem a interface `CollabTransport`.  
Podemos criar um provedor WebRTC genérico (igual ao do Docs) que qualquer ferramenta do Hub use.

### Arquivo sugerido: `aqua-runtime/src/webrtc-transport.ts`

```ts
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { CollabTransport } from './types'

export class WebRTCTransport implements CollabTransport {
  private providers = new Map<string, WebrtcProvider>()

  publish(itemId: string, update: Uint8Array) {
    // O WebrtcProvider já sincroniza o Y.Doc; aqui só garantimos que o provider existe
    this.ensure(itemId)
  }

  subscribe(itemId: string, cb: (update: Uint8Array) => void) {
    const provider = this.ensure(itemId)
    const doc = provider.doc
    const handler = () => {
      // Em produção você pode mandar o update binário do Yjs
      cb(Y.encodeStateAsUpdate(doc))
    }
    doc.on('update', handler)
    return () => doc.off('update', handler)
  }

  private ensure(itemId: string) {
    if (!this.providers.has(itemId)) {
      const doc = new Y.Doc()
      const provider = new WebrtcProvider(`aqua-hub:${itemId}`, doc, {
        signaling: ['wss://signaling.yjs.dev'], // ou seu servidor
      })
      this.providers.set(itemId, provider)
    }
    return this.providers.get(itemId)!
  }
}
```

> Dica: para produção, rode um servidor de sinalização próprio (y-webrtc aceita lista de signaling servers).

---

## 2. Expandir para o Hub

Cada ferramenta do Hub (música, vídeo, design) precisa:

1. Ter um `Y.Doc` interno (ou usar o do runtime).
2. Implementar o `collab` do `ToolSession` (já definido em `types.ts`).
3. Conectar no `WebRTCTransport` (ou no `MemoryHub` para testes).

### Exemplo mínimo de adapter com collab

```ts
// aqua-runtime/src/adapters/hub-collab.ts
import * as Y from 'yjs'
import type { ToolSession } from '../types'

export function createCollabSession(name: string): ToolSession {
  const doc = new Y.Doc()
  const map = doc.getMap('state')

  return {
    serialize: () => Y.encodeStateAsUpdate(doc),
    onChange: (cb) => {
      const h = () => cb()
      doc.on('update', h)
      return () => doc.off('update', h)
    },
    collab: {
      onLocalUpdate: (cb) => {
        const h = (update: Uint8Array) => cb(update)
        doc.on('update', h)
        return () => doc.off('update', h)
      },
      applyRemote: (update) => Y.applyUpdate(doc, update),
      stateVector: () => Y.encodeStateVector(doc),
      diff: (sv) => Y.encodeStateAsUpdate(doc, sv),
    },
    dispose: () => doc.destroy(),
  }
}
```

Ferramentas que já têm modelo (música, áudio, vídeo) podem guardar o estado no `Y.Map` / `Y.Array` em vez de objeto simples.

---

## 3. Persistência local (y-indexeddb)

Igual ao Docs:

```ts
import { IndexeddbPersistence } from 'y-indexeddb'

const persistence = new IndexeddbPersistence(`aqua-hub:${itemId}`, ydoc)
await persistence.whenSynced
```

Isso já funciona offline e sincroniza quando a rede volta.

---

## 4. Fluxo “Salvar no perfil / Publicar como post”

O Docs já faz isso via `postMessage`. Podemos padronizar para o Hub.

### Contrato de mensagem (igual ao Docs)

```ts
{
  type: "aqua-hub:publish",
  title: string,
  preview: string,          // texto curto ou markdown
  media?: { url: string; mime: string },  // imagem, áudio, vídeo exportado
  source: "music" | "video" | "design" | "docs"
}
```

### No Hub (exemplo)

```ts
function publishToAqua(payload: any) {
  const host = new URLSearchParams(location.search).get('host')
  if (host) {
    window.parent.postMessage(payload, host)
  } else {
    // fallback: download ou salvar local
    console.log('Publicar:', payload)
  }
}
```

### No app principal (AQUASOCIAL)

Ouça o `postMessage` e:

1. Crie um post normal com o preview + mídia.
2. Ou salve no perfil como “obra do Hub” (pode ser um custom lexicon depois).

---

## 5. Passos práticos recomendados

1. Adicionar `y-webrtc` e `y-indexeddb` como dependência do `aqua-runtime` (ou de um pacote `aqua-collab` compartilhado).
2. Criar `WebRTCTransport` (código acima).
3. Fazer uma ferramenta piloto do Hub (ex: design ou música) usar o `collab` do `ToolSession`.
4. Padronizar o `postMessage` de publicação.
5. No app, tratar a mensagem e criar o post.

---

## Recursos já existentes

- `aqua-docs/src/lib/` → padrão de y-indexeddb + y-webrtc + publish
- `aqua-runtime/src/transport.ts` → `MemoryHub` (bom para testes)
- `aqua-runtime/src/types.ts` → interface `collab` pronta
- `aqua-docs/README.md` → explica o `?room=` e o formato de publicação

Com isso o “criar junto” no Hub fica viável sem reinventar a roda — é o mesmo Yjs que o Docs já usa.
