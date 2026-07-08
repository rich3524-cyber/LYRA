import type { SocialProvider } from './types'
import { ProviderUnsupported } from './types'

// Native path stays intact for per-platform pivot-back. Publishing/comments are
// wired to the existing services/social/*.ts in a later phase; reviews are
// unsupported natively (GBP native path was rejected — see the design spec).
export const nativeProvider: SocialProvider = {
  async publish(account) {
    throw new ProviderUnsupported('publish', account.platform)
  },
  async fetchRecentComments(account) {
    throw new ProviderUnsupported('fetchRecentComments', account.platform)
  },
  async replyToComment(account) {
    throw new ProviderUnsupported('replyToComment', account.platform)
  },
  async fetchReviews(account) {
    throw new ProviderUnsupported('fetchReviews', account.platform)
  },
  async replyToReview(account) {
    throw new ProviderUnsupported('replyToReview', account.platform)
  },
}
