import * as Layout from '#/components/Layout'

/**
 * IU & AI (web) — a Consola da Unidade de Inteligência dentro do Aqua.
 *
 * A página estática /ui-ai/ (web/ui-ai, repositório I.U-A.I) decide sozinha o
 * que mostrar: a apresentação com o download quando a U.I. não está instalada
 * neste computador, o pareamento quando está instalada, e a Consola depois.
 */
export function UIAIScreen() {
  return (
    <Layout.Screen testID="uiAiScreen">
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>IU & AI</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <iframe
        src="/ui-ai/"
        title="Unidade de Inteligência"
        style={{
          width: '100%',
          height: 'calc(100vh - 57px)',
          border: 'none',
          display: 'block',
        }}
      />
    </Layout.Screen>
  )
}
