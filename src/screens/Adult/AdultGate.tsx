import {useState} from 'react'
import {ScrollView, View} from 'react-native'
import {useNavigation} from '@react-navigation/native'

import {type NavigationProp} from '#/lib/routes/types'
import {type AdultContextValue} from '#/state/adult/context'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {AquaLogo} from '#/components/icons/AquaLogo'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon} from '#/components/icons/Chevron'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {useBeginAgeAssurance} from '#/ageAssurance/useBeginAgeAssurance'

/**
 * Hard boundary of the +18 environment. Children — i.e. any adult content —
 * never render unless the context allows entry AND the user deliberately
 * entered, so deep links can never flash content before the checks complete,
 * and nothing +18 is prefetched behind the gate.
 */
export function AdultGate({
  ctx,
  children,
}: {
  ctx: AdultContextValue
  children: React.ReactNode
}) {
  if (ctx.adultAccessEnabled) return <>{children}</>
  return <AdultGateScreen ctx={ctx} />
}

/**
 * AQUA +18 entry gate: a temporary self-declaration of majority. This is NOT
 * an age verification — entering records a `self_declared` entry, never
 * AGE_VERIFIED. The real age-assurance pipeline stays available behind the
 * `adult_age_verification` feature gate (see below).
 */
function AdultGateScreen({ctx}: {ctx: AdultContextValue}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const beginAgeAssurance = useBeginAgeAssurance()
  const [noticeOpen, setNoticeOpen] = useState(false)

  const leaveToSafety = () => {
    // No AdultContext is created and no +18 content was ever loaded.
    navigation.navigate('Home')
  }

  // Hard-blocked states never see the declaration buttons.
  if (ctx.ageGateStatus === 'denied' || ctx.ageGateStatus === 'restricted') {
    return (
      <Layout.Center style={[a.px_xl, {paddingTop: 96}]}>
        <View style={[a.align_center, a.gap_md, {maxWidth: 420}]}>
          <Text style={[a.text_2xl, a.font_bold, a.text_center]}>
            {ctx.ageGateStatus === 'denied'
              ? 'Acesso não permitido'
              : 'Acesso restrito'}
          </Text>
          <Text
            style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
            {ctx.ageGateStatus === 'denied'
              ? 'Esta conta não pode acessar a área +18.'
              : 'A área +18 não está disponível para a sua conta ou região.'}
          </Text>
          <Button
            label="Voltar para o início"
            size="large"
            variant="solid"
            color="secondary"
            onPress={leaveToSafety}>
            <ButtonText>Voltar para o início</ButtonText>
          </Button>
        </View>
      </Layout.Center>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={[a.flex_grow, a.justify_center, a.px_xl, a.py_2xl]}
      keyboardShouldPersistTaps="handled">
      <View
        style={[
          a.align_center,
          a.gap_lg,
          {maxWidth: 460, alignSelf: 'center'},
        ]}>
        {/* Brand */}
        <View style={[a.align_center, a.gap_xs]}>
          <AquaLogo aria-hidden={true} width={44} style={t.atoms.text} />
          <Text style={[a.text_sm, a.font_bold, t.atoms.text_contrast_medium]}>
            AQUA +18
          </Text>
        </View>

        {/* Title + body */}
        <View style={[a.align_center, a.gap_sm]}>
          <Text style={[a.text_2xl, a.font_bold, a.text_center]}>
            Esta é uma área para adultos
          </Text>
          <Text
            style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
            O AQUA +18 contém conteúdo destinado exclusivamente a maiores de 18
            anos. Ao entrar, você declara que possui pelo menos 18 anos ou a
            maioridade exigida na sua jurisdição e que deseja acessar conteúdo
            destinado a adultos.
          </Text>
        </View>

        {/* User notice accordion */}
        <View
          style={[
            a.rounded_sm,
            a.border,
            t.atoms.border_contrast_low,
            {alignSelf: 'stretch'},
          ]}>
          <Button
            label="Aviso aos usuários"
            variant="ghost"
            color="secondary"
            size="small"
            accessibilityState={{expanded: noticeOpen}}
            onPress={() => setNoticeOpen(open => !open)}>
            <ButtonText>Aviso aos usuários</ButtonText>
            <ChevronDownIcon
              aria-hidden={true}
              width={16}
              style={[
                t.atoms.text_contrast_medium,
                noticeOpen && {transform: [{rotate: '180deg'}]},
              ]}
            />
          </Button>
          {noticeOpen && (
            <View style={[a.px_md, a.pb_md, a.gap_sm]}>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                • O conteúdo desta área é destinado a adultos e pode incluir
                nudez e sexualidade explícita.
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                • Sua atividade no AQUA +18 é isolada: não alimenta feeds,
                buscas nem recomendações públicas do AQUA.
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                • Criadores são responsáveis por publicar apenas conteúdo legal
                e consentido. Denúncias são analisadas pela moderação.
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                • Esta entrada usa autodeclaração de maioridade. Declarar
                falsamente sua idade viola os Termos de Uso do AQUA.
              </Text>
            </View>
          )}
        </View>

        {/* Choices — nothing is preselected */}
        {ctx.canEnter ? (
          <View style={[a.gap_sm, {alignSelf: 'stretch'}]}>
            <Button
              label="Tenho 18 anos ou mais — Entrar"
              size="large"
              variant="solid"
              color="primary"
              onPress={ctx.enter}>
              <ButtonText>Tenho 18 anos ou mais — Entrar</ButtonText>
            </Button>
            <Button
              label="Tenho menos de 18 anos — Sair"
              size="large"
              variant="outline"
              color="secondary"
              onPress={leaveToSafety}>
              <ButtonText>Tenho menos de 18 anos — Sair</ButtonText>
            </Button>
          </View>
        ) : (
          <View style={[a.align_center, a.gap_md]}>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              {ctx.ageGateStatus === 'pending'
                ? 'Sua verificação de idade está sendo processada. Tente novamente em instantes.'
                : 'Confirmação de maioridade necessária para continuar.'}
            </Text>
            {/*
              Reserved for future Age Assurance / Age Verification integration.
              Only reachable when the `adult_age_verification` feature gate is
              enabled; with the temporary self-declaration gate active, this
              trigger stays disconnected from the UI. Implementation preserved
              in '#/ageAssurance/useBeginAgeAssurance'.
            */}
            {ctx.ageVerificationEnabled &&
              (ctx.ageGateStatus === 'required' ||
                ctx.ageGateStatus === 'unknown') &&
              !!currentAccount?.email && (
                <Button
                  label="Iniciar verificação de idade"
                  size="large"
                  variant="solid"
                  color="primary"
                  disabled={beginAgeAssurance.isPending}
                  onPress={() =>
                    beginAgeAssurance.mutate({
                      email: currentAccount.email!,
                      language: 'pt',
                    })
                  }>
                  <ButtonText>
                    {beginAgeAssurance.isPending
                      ? 'Enviando...'
                      : 'Iniciar verificação'}
                  </ButtonText>
                </Button>
              )}
            <Button
              label="Voltar para o início"
              size="large"
              variant="outline"
              color="secondary"
              onPress={leaveToSafety}>
              <ButtonText>Voltar para o início</ButtonText>
            </Button>
          </View>
        )}

        {/* Parental controls */}
        <View style={[a.align_center, a.gap_xs, {paddingTop: 8}]}>
          <Link to="/settings/privacy-and-security" label="Controles Parentais">
            <Text style={[a.text_sm, a.font_bold, {color: '#0b5cff'}]}>
              Controles Parentais
            </Text>
          </Link>
          <Text
            style={[a.text_xs, a.text_center, t.atoms.text_contrast_medium]}>
            Saiba como restringir o acesso ao AQUA +18 neste dispositivo ou
            conta.
          </Text>
        </View>

        {/* Footer links — all real AQUA routes.
            TODO: replace Community Guidelines with a dedicated +18 content
            policy page when one exists. */}
        <View
          style={[
            a.flex_row,
            a.flex_wrap,
            a.justify_center,
            a.gap_md,
            {paddingTop: 8},
          ]}>
          <Link to="/support/tos" label="Termos de Uso">
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Termos de Uso
            </Text>
          </Link>
          <Link to="/support/privacy" label="Privacidade">
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Privacidade
            </Text>
          </Link>
          <Link to="/support" label="Segurança">
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Segurança
            </Text>
          </Link>
          <Link
            to="/support/community-guidelines"
            label="Política de Conteúdo +18">
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Política +18
            </Text>
          </Link>
          <Link to="/support" label="Central de Ajuda">
            <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
              Central de Ajuda
            </Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  )
}
