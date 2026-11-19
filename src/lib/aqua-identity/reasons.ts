const TEXT: Record<string, string> = {
  'invalid-identifier': 'Informe um handle (nome.domínio) ou um DID.',
  'resolve-failed':
    'Não foi possível resolver essa conta até o PDS. Confira o handle ou o DID.',
  'pds-not-found': 'O documento DID não publica um PDS.',
  'rate-limited': 'Muitas tentativas. Espere um pouco e tente de novo.',
  'pds-signup-disabled':
    'O cadastro no PDS da AQUA está desligado. Entre com uma conta Bluesky que você já tem.',
  'pds-unset':
    'Ainda não há um PDS da AQUA configurado. Contas atuais continuam em bsky.social.',
  'handle-domain-unset':
    'O domínio dos handles AQUA ainda não foi definido. Ele vem da configuração, não de um domínio fixo.',
  'handle-domain-mismatch':
    'Esse handle não está no domínio configurado da AQUA.',
  'pds-health-pending': 'Conferindo se o PDS da AQUA responde.',
  'pds-unhealthy':
    'O PDS configurado não respondeu em /xrpc/_health. O cadastro fica oculto até essa checagem passar.',
  'invalid-handle':
    'Esse nome de handle não serve. Use letras, números e hífen.',
  'invalid-email': 'Informe um e-mail válido.',
  'password-too-short':
    'Use uma senha com pelo menos 8 caracteres. Ela não fica salva na AQUA.',
  'invite-required': 'Este cadastro pede um código de convite.',
  'captcha-required': 'Confirme a verificação antiabuso antes de continuar.',
  'client-metadata-unconfigured':
    'O cliente OAuth público ainda não tem uma origem HTTPS. Defina EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN no build.',
  'public-oauth-web-only':
    'A entrada OAuth da AQUA Identity abre no site. No aplicativo nativo, a sessão herdada do Bluesky continua disponível.',
  'state-mismatch':
    'A resposta de login não confere com o pedido. Nenhuma conta foi associada.',
  'state-missing':
    'Não há um pedido de login pendente. Comece de novo em Entrar.',
  'state-expired': 'O pedido de login expirou. Tente de novo.',
  'state-reused': 'Esse pedido de login já foi usado.',
  'missing-code': 'O PDS não devolveu um código de autorização.',
  'pkce-mismatch': 'A verificação PKCE falhou. Nenhuma conta foi associada.',
  'did-mismatch':
    'O DID autenticado não é o DID resolvido antes do redirecionamento.',
  'oauth-error': 'O PDS recusou a autorização.',
  'oauth-start-failed': 'Não foi possível abrir a autorização do PDS.',
  'oauth-callback-failed': 'Não foi possível concluir a autorização.',
  'no-session': 'Não há uma sessão AT Protocol nesta página.',
  'pds-rejected': 'O PDS recusou o pedido.',
  'pds-unreachable': 'Não foi possível falar com o PDS.',
  'reset-token-required': 'Informe o código de recuperação enviado pelo PDS.',
  'session-required': 'Essa ação precisa de uma sessão ativa. Entre de novo.',
  'external-oauth-uses-pds':
    'Contas Bluesky recuperam o acesso no PDS delas. A AQUA não recebe essa senha.',
  'handle-did-mismatch':
    'O domínio publica um DID diferente desta conta. Nada foi trocado.',
  'handle-verification-failed':
    'Ainda não encontrei o DID nesse domínio. Publique o TXT ou o well-known e tente de novo.',
  'missing-did':
    'Entre primeiro. A troca de handle usa o DID da conta, que não muda.',
  'provider-disabled': 'Esse provedor não está configurado.',
  'token-invalid':
    'O provedor não confirmou a identidade. Nenhuma conta foi associada.',
  'account-conflict':
    'Essa identidade já pertence a outra conta. A AQUA não junta contas pelo e-mail.',
  'reauth-required':
    'Entre de novo para vincular ou desvincular. A confirmação precisa ser recente.',
  'last-method': 'Não dá para remover o último jeito de entrar.',
  'code-invalid': 'Código inválido ou expirado.',
  'login-failed': 'Não foi possível entrar.',
  'csrf-invalid': 'A confirmação de segurança falhou. Atualize a página.',
  'origin-rejected': 'Essa origem não pode falar com o serviço de identidade.',
  'email-unavailable': 'Não foi possível enviar o código agora.',
  'password-depends-on-email':
    'Remova a senha AQUA antes de desvincular o e-mail.',
  'email-required': 'Associe um e-mail antes de criar uma senha AQUA.',
  'password-rejected': 'Essa senha não pode ser usada.',
  'not-linked': 'Esse provedor não está vinculado.',
}

export function reasonText(reason: string, fallback?: string): string {
  return TEXT[reason] ?? fallback ?? 'Não foi possível continuar.'
}
