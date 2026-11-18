import {type EmailConfig} from './config.ts'

export type OutboundMail = {
  to: string
  subject: string
  text: string
}

export type Mailer = {
  send: (message: OutboundMail) => Promise<void>
}

export async function createMailer(
  email: EmailConfig | undefined,
  mailbox: OutboundMail[],
): Promise<Mailer> {
  if (!email) {
    return {async send() {}}
  }
  if (email.transport === 'capture') {
    return {
      async send(message) {
        mailbox.push(message)
      },
    }
  }
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport(email.smtpUrl)
  return {
    async send(message) {
      await transport.sendMail({
        from: email.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
    },
  }
}

export function emailCodeMessage(code: string): OutboundMail {
  return {
    to: '',
    subject: 'Código de acesso AQUA',
    text: [
      `Seu código AQUA: ${code}`,
      'Ele expira em 15 minutos e só pode ser usado uma vez.',
      'Se você não pediu este código, ignore esta mensagem.',
      'A AQUA não pede a senha do Google nem a senha do Bluesky.',
    ].join('\n'),
  }
}
