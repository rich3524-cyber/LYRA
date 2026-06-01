import { Resend } from 'resend'

// Fallback prevents the Resend constructor from throwing during build
// when RESEND_API_KEY is absent. At runtime the real key is always present.
export const resend = new Resend(process.env.RESEND_API_KEY ?? 're_build_placeholder')

export const FEEDBACK_RECIPIENTS = [
  'richunwin3524@gmail.com',
  'hello@lyraonline.ai',
]
