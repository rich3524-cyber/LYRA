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
              'Post scheduling across 7 social platforms',
              'Content calendar with drag-to-reschedule',
              'AI caption generation',
              'AI comment reply drafts (Draft + Approve mode can be turned on, though the approval screen isn&apos;t available on this plan — see the note below)',
              'Basic brand profile',
              'Social media analytics',
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
              'AI comment response drafts with an approval screen (Draft + Approve mode)',
              'Full AI autonomy available (AI auto-responds to comments, with confirmation)',
              'Crisis Aware available as a paid add-on, which unlocks the Crisis Keywords guardrail panel',
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
              'Crisis Aware included at no extra cost',
              'Priority support',
            ]}
          />
        </div>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-4">
          Prices shown are exclusive of any applicable taxes. Annual billing (at a discount) is
          offered when you first sign up through the public pricing page. Upgrading an existing
          plan from within LYRA (via the <Strong>Upgrade</Strong> button on the Billing page)
          keeps your current billing interval — it does not switch an annual subscriber to
          monthly.
        </p>
        <Note>
          Full AI autonomy (the AI replies to comments with no review) is available on both Pro
          and Agency — it is not an Agency-exclusive feature. On Starter, you can turn on Draft +
          Approve mode in Settings and it will generate drafted replies, but the approval screen
          in the Inbox that lets you review and send them isn&apos;t shown on Starter, so those
          drafts have nowhere to be approved from. Upgrade to Pro or Agency to use Draft + Approve
          in practice.
        </Note>
      </Subsection>

      <Subsection title="Crisis Aware add-on (Pro plan)">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Crisis Aware is bundled at no extra cost on the Agency plan. On Pro, it&apos;s available
          as a paid add-on subscription, purchased separately from your main plan. Go to{' '}
          <Strong>Settings → Add-ons</Strong> in the workspace and click <Strong>Activate</Strong>{' '}
          — this opens a Stripe checkout for the add-on specifically, billed monthly. (An annual
          billing option for this add-on exists on the backend but isn&apos;t currently reachable
          from any screen in LYRA — activating always starts a monthly add-on subscription.)
          Starter workspaces don&apos;t have access to Crisis Aware; the Add-ons card on Starter
          shows a locked icon with no way to activate it from that screen — upgrade to Pro or
          Agency first, then activate the add-on from there.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Turning on Crisis Aware also unlocks the <Strong>Crisis Keywords</Strong> panel on the
          Brand AI page, where you can add phrases that automatically escalate a matching comment
          for manual review instead of letting the AI respond to it.
        </p>
      </Subsection>

      <Subsection title="Upgrading your plan">
        <Steps>
          <Step n={1}>
            Go to <Strong>Account → Billing</Strong> and find the plan you want to move to.
          </Step>
          <Step n={2}>
            Each plan card shows its price and feature list. If a plan is higher than your
            current one, its card has an <Strong>Upgrade to [plan]</Strong> button.
          </Step>
          <Step n={3}>
            Click <Strong>Upgrade to [plan]</Strong>.
          </Step>
          <Step n={4}>
            If you already have an active subscription, LYRA updates it in place — there is no
            redirect to a Stripe checkout page and no new card details are requested. The change
            applies immediately and your plan updates within a few seconds.
          </Step>
        </Steps>
        <Note>
          Upgrading mid-cycle is pro-rated immediately: Stripe charges (or credits) the difference
          for the remainder of the current billing period as soon as the change is applied, and
          your next regular charge is the full new plan price on your usual billing date. Your
          billing interval (monthly or annual) is preserved — an annual subscriber upgrading plans
          stays on annual billing rather than being switched to monthly.
        </Note>
      </Subsection>

      <Subsection title="Managing your subscription">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          On <Strong>Account → Billing</Strong>, if you have an active Stripe subscription
          you&apos;ll see a <Strong>Manage billing</Strong> button next to your current plan.
          Click it to open the <Strong>Stripe Billing Portal</Strong> — a Stripe-hosted page where
          you can:
        </p>
        <ul className="space-y-1.5 font-sans text-sm text-text-secondary list-disc list-inside pl-2">
          <li>View your current plan and next renewal date</li>
          <li>Update your payment method (card)</li>
          <li>Update your billing address</li>
          <li>Download past invoices as PDF</li>
          <li>Cancel your subscription</li>
        </ul>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Card is the only payment method LYRA&apos;s checkout accepts today — bank account
          payment isn&apos;t offered. The <Strong>Manage billing</Strong> button only appears once
          you have a Stripe customer record (i.e. you&apos;ve completed checkout at least once);
          if you don&apos;t see it, you don&apos;t yet have billing set up. All changes made in
          the Stripe portal take effect immediately and are reflected in LYRA within a few
          minutes.
        </p>
      </Subsection>

      <Subsection title="Cancelling your subscription">
        <p className="font-sans text-sm text-text-secondary leading-relaxed">
          Open the Stripe Billing Portal (via <Strong>Account → Billing → Manage billing</Strong>)
          and cancel your plan there. Cancellation takes effect at the end of your current billing
          period, and you retain full access to your current plan&apos;s features until then.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          There is no free read-only mode. Once the billing period ends, your account
          doesn&apos;t lock or go read-only — it downgrades to the paid <Strong>Starter</Strong>{' '}
          plan ($49/month) and continues billing at that rate. Starter still gives you scheduling,
          AI caption generation, and most write access to your workspace; you simply lose whatever
          was exclusive to your previous plan (extra workspaces beyond the Starter limit, full
          brand intelligence, the approval screen for Draft + Approve replies, Full AI autonomy,
          and Crisis Aware). If you don&apos;t want to be billed at all going forward, cancel the
          Starter subscription as well from the same portal.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          If you change your mind before the billing period ends, reopen the Stripe Billing Portal
          and resume your plan there. No charge is needed — your next regular billing cycle
          continues as normal.
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
          Signing up through the public pricing page includes a <Strong>30-day free trial</Strong> on
          whichever plan you choose (Starter, Pro, or Agency) — not just Pro/Agency. A payment
          card is required upfront at checkout, but you are not charged until the trial ends.
        </p>
        <p className="font-sans text-sm text-text-secondary leading-relaxed mt-3">
          Trial accounts have full access to all features of the trialled plan. Any workspaces,
          posts, and brand profiles created during the trial are preserved once billing starts.
          If you cancel before the trial ends, use the Stripe Billing Portal as described above.
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
