import type { ReactNode } from 'react'
import { SectionHeader, Subsection, Strong, Steps, Step, Note } from './primitives'

function PlanCard({ name, price, description, features }: { name: string; price: string; description: string; features: string[] }) {
  return (
    <div className="px-5 py-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-sans text-sm font-medium text-text-primary">{name}</p>
          <p className="font-sans text-xs text-text-tertiary leading-relaxed">{description}</p>
        </div>
        <p className="font-mono text-sm text-accent-silver shrink-0 ml-6">{price}</p>
      </div>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 font-sans text-xs text-text-secondary">
            <span className="shrink-0 mt-0.5 text-status-success">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BillingSection() {
  return (
    <section id="billing" className="space-y-8 scroll-mt-28">
      <SectionHeader n="11" title="Billing" />

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA subscriptions are billed monthly (or annually at a discount) and processed
        securely through <Strong>Stripe</Strong>. LYRA never stores your payment card details —
        they are handled entirely by Stripe&apos;s PCI-compliant infrastructure. You can view and
        manage all billing details from <Strong>Account → Billing</Strong>.
      </p>

      <Subsection title="Plans">
        <div className="space-y-4">
          <PlanCard
            name="Starter"
            price="$49 / month"
            description="For solo operators and small businesses managing their own presence."
            features={[
              '1 workspace',
              'Post scheduling across 6 social platforms',
              'Content calendar with drag-to-reschedule',
              'Basic brand intelligence profile',
              'Manual inbox management (no AI responses)',
              'Social media analytics',
              'Google Search Console SEO integration',
            ]}
          />
          <PlanCard
            name="Pro"
            price="$149 / month"
            description="For freelancers and small agencies managing multiple clients."
            features={[
              'Up to 5 workspaces',
              'Everything in Starter',
              'Full brand intelligence (social feed analysis + document upload)',
              'AI caption generation',
              'AI comment response drafts (Draft + Approve mode)',
              'Client onboarding links for self-service account connection',
              'Client approval workflows',
            ]}
          />
          <PlanCard
            name="Agency"
            price="$399 / month"
            description="For agencies running social media at scale across many clients."
            features={[
              'Unlimited workspaces',
              'Everything in Pro',
              'Full AI autonomy (AI responds to comments automatically)',
              'Guardrail controls (Never discuss, Never use word, Always escalate, Approved answers)',
              'Team members with role-based access (Admin, Manager, Editor)',
              'Priority support',
            ]}
          />
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          All prices are in USD and exclusive of any applicable taxes. Annual billing is
          available at a significant discount — contact{' '}
          <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            billing@lyraonline.ai
          </a>{' '}
          for annual pricing.
        </p>
      </Subsection>

      <Subsection title="Upgrading your plan">
        <Steps>
          <Step n={1}>
            Click the <Strong>Upgrade</Strong> button in the top navigation bar (visible to
            Starter and Pro subscribers), or go to <Strong>Account → Billing</Strong> and click
            <Strong> Change plan</Strong>.
          </Step>
          <Step n={2}>
            The upgrade panel shows the next available plan with a full list of what you gain.
            Review the features and price.
          </Step>
          <Step n={3}>
            Click <Strong>Upgrade to [plan]</Strong>. You are redirected to a Stripe-hosted
            checkout page.
          </Step>
          <Step n={4}>
            Enter your payment details (card number, expiry, CVC, and billing address).
            Stripe handles all payment security — LYRA never sees your card number.
          </Step>
          <Step n={5}>
            Click <Strong>Subscribe</Strong>. The payment is processed immediately and you are
            redirected back to LYRA. The new plan features are active within 30 seconds.
          </Step>
        </Steps>
        <Note>
          When upgrading mid-cycle, Stripe calculates a pro-rated charge for the remainder of
          the current billing period. Your next regular charge will be the full new plan price
          on your regular billing date.
        </Note>
      </Subsection>

      <Subsection title="Managing your subscription">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Go to <Strong>Account → Billing</Strong> and click <Strong>Manage subscription</Strong>.
          This opens the <Strong>Stripe Billing Portal</Strong> — a Stripe-hosted page where you can:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>View your current plan and next renewal date</li>
          <li>Update your payment method (card or bank account)</li>
          <li>Update your billing address</li>
          <li>Download past invoices as PDF</li>
          <li>Cancel your subscription</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          All changes made in the Stripe portal take effect immediately and are reflected
          in LYRA within a few minutes.
        </p>
      </Subsection>

      <Subsection title="Cancelling your subscription">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Open the Stripe Billing Portal (via <Strong>Account → Billing → Manage subscription</Strong>)
          and click <Strong>Cancel plan</Strong>. Cancellation takes effect at the end of your
          current billing period. You retain full access to all paid features until then.
          After the period ends, your account downgrades to a free read-only state — you
          can still log in and view your data, but scheduling, AI features, and new
          social connections are disabled.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          If you change your mind before the billing period ends, open the portal again and
          click <Strong>Resume plan</Strong> to reactivate. No charge is needed — your next
          regular billing cycle continues as normal.
        </p>
      </Subsection>

      <Subsection title="Refund policy">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          LYRA does not offer refunds for partial months. If you are charged and cancel
          immediately, you retain access for the remainder of the billing period — effectively
          you have already paid for that time.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          If you believe you were charged in error — for example, a duplicate charge or a
          charge after cancellation — contact{' '}
          <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            billing@lyraonline.ai
          </a>{' '}
          within 14 days and we will investigate. Include your account email and the
          approximate charge date.
        </p>
      </Subsection>

      <Subsection title="Free trial">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Pro and Agency plans include a 14-day free trial. No credit card is required to start.
          At the end of the trial, you will be prompted to enter payment details to continue.
          If you do not enter payment details, your account automatically reverts to Starter
          at the end of the trial period.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Trial accounts have full access to all features of the trialled plan. Any workspaces,
          posts, and brand profiles created during the trial are preserved if you subscribe.
        </p>
      </Subsection>

      <Subsection title="Invoices">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Invoices are generated automatically by Stripe on each billing date and emailed to
          the billing email address on your account. To download a PDF copy of any invoice, open
          the Stripe Billing Portal and click <Strong>Invoices</Strong>. All historical invoices
          are available.
        </p>
      </Subsection>

      <Subsection title="Need help?">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          For any questions not covered here, reach out to the LYRA support team:
        </p>
        <div className="mt-3 space-y-1 font-sans text-sm text-text-secondary">
          <p>
            <Strong>General support:</Strong>{' '}
            <a href="mailto:support@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
              support@lyraonline.ai
            </a>
          </p>
          <p>
            <Strong>Billing enquiries:</Strong>{' '}
            <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
              billing@lyraonline.ai
            </a>
          </p>
          <p>
            <Strong>Privacy and data requests:</Strong>{' '}
            <a href="mailto:privacy@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
              privacy@lyraonline.ai
            </a>
          </p>
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          We aim to respond to all support requests within one business day (AEST).
        </p>
      </Subsection>
    </section>
  )
}
