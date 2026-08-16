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

export default function HelpPrintPage() {
  return (
    <div className="bg-background-primary min-h-screen">
      <div className="max-w-[720px] mx-auto px-10 py-16">

        {/* Cover header */}
        <div className="mb-20 pb-10 border-b border-background-border">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.25em] mb-3">
                LYRA
              </p>
              <h1 className="font-display text-4xl text-text-primary leading-tight">
                Help Guide
              </h1>
              <p className="font-sans text-sm text-text-tertiary mt-3">
                Complete platform documentation — lyraonline.ai
              </p>
            </div>
            <p className="font-mono text-xs text-text-tertiary text-right">
              {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* All sections — same components as the live help page */}
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

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-background-border flex items-center justify-between">
          <p className="font-sans text-xs text-text-tertiary">
            © {new Date().getFullYear()} LYRA. All rights reserved.
          </p>
          <p className="font-sans text-xs text-text-tertiary">
            lyraonline.ai/help
          </p>
        </div>
      </div>
    </div>
  )
}
