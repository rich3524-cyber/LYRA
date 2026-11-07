import { describe, it, expect } from 'vitest'
import { isSelfComment, type AccountIdentity } from './self-comment'

const ITW: AccountIdentity = { platformId: 'li-itw', handle: 'intothewild', name: 'Into The Wild Marketing' }
const LYRA: AccountIdentity = { platformId: 'li-lyra', handle: 'lyraonline', name: 'Lyra Online Social' }
const WORKSPACE = [ITW, LYRA]

describe('isSelfComment', () => {
  it('trusts isOwner when the platform sets it', () => {
    expect(isSelfComment({ isOwner: true, name: 'Someone Else' }, [])).toBe(true)
  })

  it.each([
    ['platform id', { id: 'li-itw' }],
    ['username', { username: 'intothewild' }],
    ['display name', { name: 'Into The Wild Marketing' }],
  ])('matches the posting account by %s', (_label, author) => {
    expect(isSelfComment(author, WORKSPACE)).toBe(true)
  })

  // The 2026-11-07 case. Lyra Online Social commented on an Into The Wild
  // post; it is genuinely a different account, so isOwner was false and every
  // single-account check passed it through as an incoming comment. The AI
  // then publicly replied to the operator's own other brand, twice.
  it('matches a SIBLING account in the same workspace, which isOwner cannot', () => {
    const author = { isOwner: false, id: 'li-lyra', name: 'Lyra Online Social' }

    expect(isSelfComment(author, [ITW])).toBe(false)
    expect(isSelfComment(author, WORKSPACE)).toBe(true)
  })

  it('lets a genuine external commenter through', () => {
    expect(isSelfComment({ id: 'li-tom', username: 'tomelliott', name: 'Tom Elliott' }, WORKSPACE)).toBe(false)
  })

  it('is case- and whitespace-insensitive, since display names are user-entered', () => {
    expect(isSelfComment({ name: '  LYRA ONLINE SOCIAL  ' }, WORKSPACE)).toBe(true)
  })

  // Ingestion writes the literal string 'Unknown' when a platform gives no
  // author, and an account can have a blank handle. Matching blank-to-blank
  // would silently swallow every anonymous commenter -- the failure would
  // look like comments simply never arriving.
  it('never matches on blank fields at both ends', () => {
    const blankAccount: AccountIdentity = { platformId: null, handle: '', name: null }

    expect(isSelfComment({ name: '', username: '' }, [blankAccount])).toBe(false)
    expect(isSelfComment({ name: 'Unknown' }, [blankAccount])).toBe(false)
  })

  it('handles a missing author and an empty workspace without throwing', () => {
    expect(isSelfComment(null, WORKSPACE)).toBe(false)
    expect(isSelfComment(undefined, WORKSPACE)).toBe(false)
    expect(isSelfComment({ name: 'Tom' }, [])).toBe(false)
  })
})
