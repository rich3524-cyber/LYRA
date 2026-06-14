import { Divider } from '@/components/lyra/help/primitives'
import { GettingStartedSection } from '@/components/lyra/help/section-01-getting-started'
import { WorkspacesSection } from '@/components/lyra/help/section-02-workspaces'
import { SocialConnectionsSection } from '@/components/lyra/help/section-03-social-connections'
import { BrandIntelligenceSection } from '@/components/lyra/help/section-04-brand-intelligence'
import { ContentCalendarSection } from '@/components/lyra/help/section-05-content-calendar'
import { ComposeSection } from '@/components/lyra/help/section-06-compose'
import { InboxSection } from '@/components/lyra/help/section-07-inbox'
import { SeoSection } from '@/components/lyra/help/section-08-seo'
import { AnalyticsSection } from '@/components/lyra/help/section-09-analytics'
import { SettingsSection } from '@/components/lyra/help/section-10-settings'
import { BillingSection } from '@/components/lyra/help/section-11-billing'

export const metadata = {
  title: 'Documentation — LYRA',
  description: 'Complete guide to using the LYRA platform.',
}

export default function HelpPage() {
  return (
    <div className="space-y-20">
      <GettingStartedSection />
      <Divider />
      <WorkspacesSection />
      <Divider />
      <SocialConnectionsSection />
      <Divider />
      <BrandIntelligenceSection />
      <Divider />
      <ContentCalendarSection />
      <Divider />
      <ComposeSection />
      <Divider />
      <InboxSection />
      <Divider />
      <SeoSection />
      <Divider />
      <AnalyticsSection />
      <Divider />
      <SettingsSection />
      <Divider />
      <BillingSection />
    </div>
  )
}
