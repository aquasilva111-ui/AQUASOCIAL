import {Empty, LibraryPage} from './shared'

/**
 * Recurring paid support for channels has no billing backend yet, so this
 * page only explains the state instead of showing invented subscriptions.
 */
export function ViewPaidScreen() {
  return (
    <LibraryPage
      testID="viewPaidScreen"
      title="Assinaturas pagas"
      subtitle="Canais que você apoia com uma mensalidade.">
      <Empty
        title="Você ainda não apoia nenhum canal"
        body="O apoio mensal a criadores ainda não está disponível no AQUA. Quando estiver, suas assinaturas, cobranças e planos aparecem aqui."
      />
    </LibraryPage>
  )
}
