// Canonical catalogue of events a notification channel can deliver.
//
// Stored on NotificationChannel.enabledEvents as String[] rather than a Prisma
// enum so adding an event is a code change, not a migration. That means this
// file is the only validator -- anything writing enabledEvents must filter
// through isNotificationEvent().

export const NOTIFICATION_EVENTS = [
  'CRISIS_DETECTED',
  'COMMENT_ESCALATED',
  'POST_FAILED',
  'POST_PENDING_APPROVAL',
  'APPROVAL_SLA_BREACH',
  'POST_PUBLISHED',
] as const

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return typeof value === 'string' && (NOTIFICATION_EVENTS as readonly string[]).includes(value)
}

/**
 * Filters arbitrary input down to valid, de-duplicated event keys. Used by
 * every route that accepts an enabledEvents array -- an unrecognised key is
 * dropped rather than rejected, so a client on an older build can still save
 * its toggles without a 400.
 */
export function sanitizeEvents(input: unknown): NotificationEvent[] {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input.filter(isNotificationEvent)))
}

interface EventMeta {
  /** Shown in the Settings toggle list. */
  label: string
  /** One-line explanation under the label. */
  description: string
  /** Whether a newly-connected channel has this on. */
  defaultOn: boolean
}

// Conservative defaults, per the scope doc's notification-fatigue risk: the
// four "something needs a human" events are on, the routine success event is
// off. A channel people mute is worth nothing during a real crisis.
export const EVENT_META: Record<NotificationEvent, EventMeta> = {
  CRISIS_DETECTED: {
    label:       'Crisis detected',
    description: 'Crisis Aware escalated a comment or a negative sentiment spike.',
    defaultOn:   true,
  },
  COMMENT_ESCALATED: {
    label:       'Comment escalated',
    description: 'A comment needs a human reply instead of an AI one (not a crisis).',
    defaultOn:   true,
  },
  POST_FAILED: {
    label:       'Post failed to publish',
    description: 'A scheduled post could not be published to its platform.',
    defaultOn:   true,
  },
  POST_PENDING_APPROVAL: {
    label:       'New post pending approval',
    description: 'A post was submitted and is waiting for a reviewer.',
    defaultOn:   true,
  },
  APPROVAL_SLA_BREACH: {
    label:       'Approval overdue',
    description: 'A post has been waiting for approval past its deadline.',
    defaultOn:   true,
  },
  POST_PUBLISHED: {
    label:       'Post published',
    description: 'A scheduled post went live. Off by default — this one is noisy.',
    defaultOn:   false,
  },
}

export function defaultEnabledEvents(): NotificationEvent[] {
  return NOTIFICATION_EVENTS.filter((e) => EVENT_META[e].defaultOn)
}

// A channel this many consecutive failures deep is surfaced as broken in
// Settings. Not auto-disabled -- a transient Zernio outage must not silently
// switch a customer's crisis alerting off; the customer decides.
//
// Lives in this module rather than beside the delivery code because the
// Settings panel is a client component: importing it from delivery.ts would
// pull prisma and the Zernio client into the browser bundle. This file is pure.
export const FAILURE_WARNING_THRESHOLD = 3
