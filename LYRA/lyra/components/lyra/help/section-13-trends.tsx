import { SectionHeader, Note } from './primitives'

export function TrendsSection() {
  return (
    <section id="trends" className="space-y-8 scroll-mt-28">
      <SectionHeader n="13" title="LYRA Trend" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA Trend — daily AI-scored trend intelligence matched to your brand, surfaced in a
        dedicated Trend Hub and usable directly from the composer — is a planned add-on that
        has not shipped yet.
      </p>

      <Note>
        LYRA Trend is not yet available. Checkout for the add-on is currently disabled so no
        one is charged for it before it launches. There is no Trend Hub, no trend discovery
        sync, and no composer integration today. This section will be filled in once the
        feature ships.
      </Note>
    </section>
  )
}
