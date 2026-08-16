export const metadata = {
  title: 'Terms of Service — LYRA',
  description: 'The terms governing your use of the LYRA platform.',
}

export default function TermsPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Legal
        </p>
        <h1 className="font-display text-4xl text-text-primary">Terms of Service</h1>
        <p className="font-sans text-sm text-text-tertiary">
          Last updated: 18 May 2026
        </p>
      </div>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of the LYRA platform
        (&quot;Service&quot;) operated by Into The Wild Marketing (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        By creating an account or using the Service, you agree to be bound by these Terms.
        If you do not agree, do not use LYRA.
      </p>

      <Section title="1. The Service">
        <p>
          LYRA is a software-as-a-service (SaaS) platform that enables users to manage social media
          content, schedule posts, generate AI-assisted content, and monitor audience engagement across
          multiple social media platforms on behalf of their clients.
        </p>
        <p>
          The Service is intended for business use. By using LYRA, you represent that you are at least
          18 years old and have the authority to enter into these Terms on behalf of yourself or your organisation.
        </p>
      </Section>

      <Section title="2. Accounts and Access">
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for all
          activity that occurs under your account. You must notify us immediately at{' '}
          <a href="mailto:support@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            support@lyraonline.ai
          </a>{' '}
          if you suspect unauthorised access.
        </p>
        <p>
          You must not share your account with others, create accounts by automated means, or create
          multiple accounts to circumvent plan limits.
        </p>
      </Section>

      <Section title="3. Subscription Plans and Billing">
        <p>
          LYRA is offered on a subscription basis. By selecting a paid plan, you authorise us to charge
          your payment method on a recurring monthly or annual basis until you cancel.
        </p>
        <ul>
          <li><strong>Starter</strong> — $49/month. Includes 1 workspace.</li>
          <li><strong>Pro</strong> — $149/month. Includes 5 workspaces and AI draft responses.</li>
          <li><strong>Agency</strong> — $399/month. Includes unlimited workspaces and full AI autonomy.</li>
        </ul>
        <p>
          All prices are in USD and exclusive of any applicable taxes. Subscriptions auto-renew unless
          cancelled at least 24 hours before the renewal date.
        </p>
        <p>
          Payments are processed by Stripe. We do not store your payment card details. By subscribing,
          you also agree to Stripe&apos;s terms of service.
        </p>
        <p>
          We reserve the right to change pricing with 30 days&apos; notice. Continued use after the price
          change takes effect constitutes acceptance of the new pricing.
        </p>
      </Section>

      <Section title="4. Refunds and Cancellations">
        <p>
          You may cancel your subscription at any time via the billing portal in your account settings.
          Cancellation takes effect at the end of the current billing period — you will retain access
          to paid features until then.
        </p>
        <p>
          We do not offer refunds for partial months. If you believe you were charged in error, contact us
          within 14 days at{' '}
          <a href="mailto:billing@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            billing@lyraonline.ai
          </a>.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You must not use LYRA to:</p>
        <ul>
          <li>Post content that is unlawful, defamatory, harassing, abusive, fraudulent, or obscene</li>
          <li>Violate the terms of service of any connected social media platform</li>
          <li>Impersonate any person, brand, or entity</li>
          <li>Distribute spam, malware, or phishing content</li>
          <li>Engage in coordinated inauthentic behaviour or platform manipulation</li>
          <li>Reverse-engineer, decompile, or attempt to extract our source code</li>
          <li>Use automated means to scrape, crawl, or extract data from the Service beyond what the API supports</li>
          <li>Resell or sublicense access to the Service without our written consent</li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts that violate these restrictions without
          prior notice.
        </p>
      </Section>

      <Section title="6. AI-Generated Content">
        <p>
          LYRA uses the Anthropic Claude API to generate captions, responses, and SEO content.
          AI-generated content is produced based on your brand profile and instructions.
        </p>
        <p>
          You are solely responsible for reviewing and approving all AI-generated content before it is
          published. We do not guarantee the accuracy, appropriateness, or fitness for purpose of any
          AI-generated output. We are not liable for any consequences arising from AI-generated content
          published through the platform.
        </p>
        <p>
          By using AI features, you grant us a limited licence to process your brand data and instructions
          via Anthropic&apos;s API for the purpose of generating content on your behalf.
        </p>
      </Section>

      <Section title="7. Social Media Platform Compliance">
        <p>
          By connecting a social media account to LYRA, you represent that you have the authority to do so
          and that your use complies with the terms of service of the relevant platform. You are responsible
          for ensuring that content published through LYRA complies with applicable platform policies.
        </p>
        <p>
          We are not affiliated with, endorsed by, or sponsored by any social media platform. Platform API
          access may be modified or revoked by the platform at any time, which may affect the availability
          of features.
        </p>
      </Section>

      <Section title="8. Your Content">
        <p>
          You retain ownership of all content you create or upload through LYRA (&quot;Your Content&quot;).
          By using the Service, you grant us a limited, non-exclusive, worldwide licence to store,
          process, and transmit Your Content solely for the purpose of providing the Service to you.
        </p>
        <p>
          We do not claim ownership of Your Content and we will not use it for any purpose beyond
          providing and improving the Service.
        </p>
      </Section>

      <Section title="9. Intellectual Property">
        <p>
          The LYRA platform, including its design, code, branding, and AI models, is owned by Into The
          Wild Marketing and protected by copyright and other intellectual property laws. You may not copy,
          modify, distribute, or create derivative works from any part of the Service without our written consent.
        </p>
      </Section>

      <Section title="10. Availability and Uptime">
        <p>
          We aim to provide a reliable service but do not guarantee 100% uptime. The Service may be
          temporarily unavailable due to maintenance, updates, or circumstances beyond our control.
          We will endeavour to provide advance notice of planned maintenance where reasonably possible.
        </p>
        <p>
          We are not liable for any loss resulting from downtime, scheduled or unscheduled.
        </p>
      </Section>

      <Section title="11. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, LYRA and Into The Wild Marketing shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages, including but not
          limited to loss of profits, data, goodwill, or business opportunities, arising out of or in
          connection with your use of the Service.
        </p>
        <p>
          Our total liability to you for any claim arising from these Terms or your use of the Service
          shall not exceed the amount you paid to us in the 3 months preceding the claim.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot be excluded under Australian
          Consumer Law, including the consumer guarantees provided by the Competition and Consumer Act 2010 (Cth).
        </p>
      </Section>

      <Section title="12. Indemnification">
        <p>
          You agree to indemnify and hold harmless Into The Wild Marketing and its officers, employees,
          and agents from any claims, damages, or expenses (including legal fees) arising from your use
          of the Service, Your Content, or your violation of these Terms or any third-party rights.
        </p>
      </Section>

      <Section title="13. Termination">
        <p>
          We may suspend or terminate your access to LYRA at any time, with or without notice, if you
          breach these Terms or if we discontinue the Service. Upon termination, your right to use the
          Service ceases immediately.
        </p>
        <p>
          You may delete your account at any time via your account settings. Sections 8, 9, 11, and 12
          survive termination.
        </p>
      </Section>

      <Section title="14. Governing Law">
        <p>
          These Terms are governed by the laws of New South Wales, Australia. Any disputes arising from
          these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the
          courts of New South Wales, Australia.
        </p>
      </Section>

      <Section title="15. Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will notify you of material changes by email
          or in-app notice at least 14 days before the change takes effect. Continued use of the Service
          after the effective date constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          For any questions about these Terms, contact us at:
        </p>
        <p>
          <strong>Into The Wild Marketing</strong><br />
          Australia<br />
          Email:{' '}
          <a href="mailto:legal@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            legal@lyraonline.ai
          </a>
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-sans text-base font-medium text-text-primary">{title}</h2>
      <div className="space-y-3 font-sans text-sm text-text-secondary leading-relaxed [&_ul]:space-y-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-text-tertiary [&_strong]:text-text-primary">
        {children}
      </div>
    </section>
  )
}
