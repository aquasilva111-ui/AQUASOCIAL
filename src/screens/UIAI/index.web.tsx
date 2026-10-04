import {useState} from 'react'
import {View} from 'react-native'

import {DesktopLeftNav} from '#/view/shell/desktop/LeftNav'
import {atoms as a, useLayoutBreakpoints, useTheme} from '#/alf'
import {LEFT_NAV_WIDTH} from '#/components/Layout/const'

const OLHO = 48
const CALHA = 76 // coluna onde o olho mora, sempre visível
const CENTRO = CALHA / 2 // centro do olho, de onde o menu nasce
const MENU_MINIMO = 86

// Estilos com animação e com "menos movimento", que os estilos do React Native não expressam.
const CSS = `
.uiai-coluna { position: relative; flex: none; height: 100vh; overflow: hidden;
  transition: width .55s cubic-bezier(.65,0,.35,1); }
.uiai-menu { position: absolute; top: 0; bottom: 0; left: ${CALHA}px;
  clip-path: circle(0px at ${CENTRO - CALHA}px ${CENTRO}px); opacity: 0;
  transition: clip-path .55s cubic-bezier(.65,0,.35,1), opacity .3s ease; }
.uiai-coluna.aberta .uiai-menu { clip-path: circle(2400px at ${CENTRO - CALHA}px ${CENTRO}px); opacity: 1; }
.uiai-olho { position: absolute; left: ${(CALHA - OLHO) / 2}px; top: ${(CALHA - OLHO) / 2}px;
  width: ${OLHO}px; height: ${OLHO}px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
  background: #002bf0; display: flex; align-items: center; justify-content: center;
  transition: transform .35s ease, box-shadow .35s ease; }
.uiai-olho:hover { transform: scale(1.08); }
.uiai-olho:focus-visible { outline: 2px solid #00a0ff; outline-offset: 3px; }
.uiai-coluna.aberta .uiai-olho { box-shadow: 0 0 0 6px rgba(0,160,255,.25); }
.uiai-branco { width: 57.5%; height: 57.5%; border-radius: 50%; background: #fff;
  display: flex; align-items: center; justify-content: center; }
.uiai-iris { width: 73%; height: 73%; border-radius: 50%; background: #00a0ff;
  display: flex; align-items: center; justify-content: center; animation: uiai-piscar 4s ease-in-out infinite; }
.uiai-pupila { width: 49%; height: 49%; border-radius: 50%; background: #000; }
@keyframes uiai-piscar { 0%, 90%, 100% { transform: scaleY(1); } 94% { transform: scaleY(.1); } }
@media (prefers-reduced-motion: reduce) {
  .uiai-coluna, .uiai-menu, .uiai-olho { transition: none; }
  .uiai-iris { animation: none; }
}
`

/**
 * IU & AI (web) — a Consola da Unidade de Inteligência em página inteira.
 *
 * Sem a coluna da direita e sem a barra de baixo do Aqua. O menu da esquerda
 * mora dentro do olho do Aqua: clicando no olho ele nasce do centro dele e
 * empurra a U.I. para o lado (nunca fica por cima); clicando de novo, volta.
 * A página /ui-ai/ (web/ui-ai, repositório I.U-A.I) decide o que mostrar.
 */
export function UIAIScreen() {
  const t = useTheme()
  const {leftNavMinimal} = useLayoutBreakpoints()
  const [aberto, setAberto] = useState(false)
  const largura =
    CALHA + (aberto ? (leftNavMinimal ? MENU_MINIMO : LEFT_NAV_WIDTH) : 0)

  return (
    <View testID="uiAiScreen" style={[a.flex_1, a.flex_row, t.atoms.bg]}>
      <style>{CSS}</style>
      <div
        className={aberto ? 'uiai-coluna aberta' : 'uiai-coluna'}
        style={{
          width: largura,
          borderRight: `1px solid ${t.atoms.border_contrast_low.borderColor}`,
        }}>
        <div
          className="uiai-menu"
          aria-hidden={!aberto}
          inert={!aberto || undefined}>
          <DesktopLeftNav embedded />
        </div>
        <button
          type="button"
          className="uiai-olho"
          aria-label={
            aberto ? 'Esconder o menu do Aqua' : 'Mostrar o menu do Aqua'
          }
          aria-expanded={aberto}
          onClick={() => setAberto(v => !v)}>
          <span className="uiai-branco">
            <span className="uiai-iris">
              <span className="uiai-pupila" />
            </span>
          </span>
        </button>
      </div>
      <iframe
        src="/ui-ai/"
        title="Unidade de Inteligência"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100vh',
          border: 'none',
          display: 'block',
        }}
      />
    </View>
  )
}
