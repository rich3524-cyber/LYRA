import { Resend } from 'resend'

// Lazy, mirroring lib/stripe.ts's getStripe()/Proxy pattern -- NOT
// lib/anthropic.ts's module-load instantiation. Resend's constructor throws
// synchronously if RESEND_API_KEY is missing, and callers of this module
// (crisis-detector.ts) rely on their own try/catch around the *call site* to
// keep an email failure from ever affecting crisis detection. A module-load
// throw would fire at import time, outside any try/catch, and would take
// down crisis detection entirely -- exactly the failure mode the fail-open
// design is meant to prevent. Deferring instantiation to first use keeps the
// throw inside the caller's try/catch instead.
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
export const resend = new Proxy({} as Resend, {
  get: (_, prop) => getResend()[prop as keyof Resend],
})

export const EMAIL_FROM = 'notifications@lyraonline.ai'
