import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

export const FEEDBACK_RECIPIENTS = [
  'richunwin3524@gmail.com',
  'hello@lyraonline.ai',
]
