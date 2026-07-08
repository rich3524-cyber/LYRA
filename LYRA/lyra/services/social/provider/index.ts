import type { SocialAccount } from '@prisma/client'
import type { SocialProvider } from './types'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

// Dispatch requires BOTH provider === 'ZERNIO' AND a real zernioAccountId, not
// provider alone. Phase 1's schema migration defaulted every existing account to
// provider='ZERNIO' regardless of whether it actually went through Zernio's
// connect flow -- an account with that label but no zernioAccountId is really a
// native account whose provider column hasn't been corrected (see Phase 3's
// one-time backfill), and routing it to zernioProvider would throw on every call
// (requireZernioId) instead of using the native credentials it actually has.
export function getProvider(account: Pick<SocialAccount, 'provider' | 'zernioAccountId'>): SocialProvider {
  return account.provider === 'ZERNIO' && account.zernioAccountId != null ? zernioProvider : nativeProvider
}

export type { SocialProvider } from './types'
