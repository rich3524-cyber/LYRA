// Shared between comment-card.tsx and review-card.tsx -- both Comment and
// Review reuse the same Sentiment enum (see prisma/schema.prisma), so their
// cards render sentiment identically. Extracted here rather than duplicated
// so the two small maps below only ever need updating in one place.
export const SENTIMENT_COLOURS: Record<string, string> = {
  POSITIVE: 'text-status-success',
  NEUTRAL:  'text-text-secondary',
  NEGATIVE: 'text-status-error',
  URGENT:   'text-status-warning',
}

export const SENTIMENT_LABELS: Record<string, string> = {
  POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative', URGENT: 'Urgent',
}
