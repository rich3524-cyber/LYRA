import type { SocialAccount } from '@prisma/client'
import type { SocialProvider } from './types'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

export function getProvider(account: Pick<SocialAccount, 'provider'>): SocialProvider {
  return account.provider === 'ZERNIO' ? zernioProvider : nativeProvider
}

export type { SocialProvider } from './types'
