import { describe, it, expect } from 'vitest'
import { extractMailchimpServer } from './mailchimp-campaigns'

describe('extractMailchimpServer', () => {
  it('extracts a real datacenter suffix', () => {
    expect(extractMailchimpServer('abc123def456-us21')).toBe('us21')
    expect(extractMailchimpServer('abc123def456-us1')).toBe('us1')
  })

  it('rejects a key with no server suffix', () => {
    expect(() => extractMailchimpServer('abc123def456')).toThrow(/Invalid Mailchimp API key format/)
  })

  it('rejects a host-injection attempt disguised as a server suffix', () => {
    // "x-evil.io/" would previously pass (non-empty, <=10 chars) and get
    // interpolated directly into a hostname by the caller.
    expect(() => extractMailchimpServer('x-evil.io/')).toThrow(/Invalid Mailchimp API key format/)
  })

  it('rejects a suffix that is the right length but not the real shape', () => {
    expect(() => extractMailchimpServer('abc123-uss1')).toThrow(/Invalid Mailchimp API key format/)
    expect(() => extractMailchimpServer('abc123-1us')).toThrow(/Invalid Mailchimp API key format/)
  })
})
