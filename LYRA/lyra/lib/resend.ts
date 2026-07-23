import { Resend } from 'resend'

// Mirrors lib/anthropic.ts's pattern -- one shared client instance, no
// per-call instantiation. RESEND_API_KEY is already set in the environment
// (confirmed via `netlify env:list`); the `resend` package and this client
// are new -- nothing in this codebase has ever sent an email before.
export const resend = new Resend(process.env.RESEND_API_KEY)

export const EMAIL_FROM = 'notifications@lyraonline.ai'
