export const metadata = {
  title: 'Privacy Policy — LYRA',
  description: 'How LYRA collects, uses, and protects your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Legal
        </p>
        <h1 className="font-display text-4xl text-text-primary">Privacy Policy</h1>
        <p className="font-sans text-sm text-text-tertiary">
          Last updated: 18 May 2026
        </p>
      </div>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        LYRA (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is operated by Into The Wild Marketing (ABN to be inserted),
        a company registered in Australia. This Privacy Policy explains how we collect, use, disclose,
        and safeguard your personal information when you use the LYRA platform at lyraonline.ai.
      </p>

      <p className="font-sans text-sm text-text-secondary leading-relaxed">
        We comply with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).
        Where applicable, we also comply with the EU General Data Protection Regulation (GDPR).
      </p>

      <Section title="1. Information We Collect">
        <p>We collect the following categories of personal information:</p>
        <ul>
          <li><strong>Account information</strong> — your name and email address, collected when you sign up via Google or email.</li>
          <li><strong>Workspace data</strong> — the name, website URL, and industry of your connected clients or workspaces.</li>
          <li><strong>Social media credentials</strong> — OAuth access tokens for connected social platforms (Facebook, Instagram, LinkedIn, Google Business, X, TikTok). These tokens are encrypted at rest using AES-256-GCM and are never exposed in API responses or logs.</li>
          <li><strong>Content data</strong> — social media posts you create or schedule through LYRA, comments retrieved from connected platforms, and AI-generated captions and responses.</li>
          <li><strong>Usage data</strong> — pages visited, features used, and actions taken within the platform, used to improve the service.</li>
          <li><strong>Payment information</strong> — billing details are handled entirely by Stripe. We do not store payment card numbers. We receive and store your Stripe customer ID and subscription status.</li>
          <li><strong>Search Console data</strong> — if you connect Google Search Console, we retrieve and display your site&apos;s query and performance data. This data is read-only and is not stored long-term.</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <p>We use your personal information to:</p>
        <ul>
          <li>Provide, operate, and maintain the LYRA platform</li>
          <li>Authenticate you and manage your account and workspaces</li>
          <li>Publish social media content on your behalf on connected platforms</li>
          <li>Generate AI-powered captions, responses, and SEO content based on your brand profile</li>
          <li>Process your subscription payments via Stripe</li>
          <li>Send transactional emails (e.g. account notifications, billing receipts)</li>
          <li>Improve and develop new features through aggregated, anonymised usage analytics</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>
          We do not use your content or your clients&apos; data to train AI models. AI features are powered
          by the Anthropic Claude API; your data is sent to Anthropic solely to generate responses
          and is subject to Anthropic&apos;s privacy policy.
        </p>
      </Section>

      <Section title="3. Disclosure of Your Information">
        <p>We share your personal information only with:</p>
        <ul>
          <li><strong>Anthropic</strong> — to power AI caption, response, and SEO content generation.</li>
          <li><strong>Auth0</strong> — to manage authentication and user sessions.</li>
          <li><strong>Stripe</strong> — to process subscription payments.</li>
          <li><strong>Supabase / AWS</strong> — to store your data securely (database and file storage).</li>
          <li><strong>Social platforms</strong> — when you instruct us to publish content or retrieve data on your behalf.</li>
          <li><strong>Google</strong> — when you connect Google Search Console, to retrieve your site performance data.</li>
        </ul>
        <p>
          We do not sell, rent, or trade your personal information to third parties for marketing purposes.
          We do not share your data with any party not listed above unless required by law or with your explicit consent.
        </p>
      </Section>

      <Section title="4. Data Storage and Security">
        <p>
          Your data is stored in the Asia-Pacific (Sydney) region. We implement the following security measures:
        </p>
        <ul>
          <li>AES-256-GCM encryption for all stored social media access tokens</li>
          <li>TLS encryption for all data in transit</li>
          <li>Row-level access controls — your data is isolated from other users&apos; data</li>
          <li>Access tokens are never logged or returned in API responses</li>
        </ul>
        <p>
          No method of transmission over the Internet is 100% secure. While we take commercially reasonable
          steps to protect your information, we cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="5. Data Retention">
        <p>
          We retain your personal information for as long as your account is active or as needed to provide
          the service. If you delete your account:
        </p>
        <ul>
          <li>Your account data and workspace data are deleted within 30 days</li>
          <li>Social media access tokens are deleted immediately</li>
          <li>Billing records are retained for 7 years as required by Australian tax law</li>
          <li>Anonymised, aggregated usage data may be retained indefinitely</li>
        </ul>
      </Section>

      <Section title="6. Your Rights">
        <p>Under the Australian Privacy Act and, where applicable, the GDPR, you have the right to:</p>
        <ul>
          <li>Access the personal information we hold about you</li>
          <li>Request correction of inaccurate information</li>
          <li>Request deletion of your personal information (subject to legal retention requirements)</li>
          <li>Withdraw consent for processing where consent is the legal basis</li>
          <li>Lodge a complaint with the Office of the Australian Information Commissioner (OAIC)</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:privacy@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            privacy@lyraonline.ai
          </a>.
          We will respond within 30 days.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          LYRA uses session cookies to maintain your authenticated session. These are strictly necessary
          for the platform to function and cannot be disabled while using the service. We do not use
          advertising or tracking cookies.
        </p>
      </Section>

      <Section title="8. Third-Party Links">
        <p>
          The platform may display links to third-party websites or services (e.g. social platforms).
          We are not responsible for the privacy practices of those third parties. We encourage you
          to review their privacy policies.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes
          by email or by displaying a notice within the platform at least 14 days before the change
          takes effect. Continued use of LYRA after the effective date constitutes acceptance of the
          updated policy.
        </p>
      </Section>

      <Section title="10. Contact Us">
        <p>
          For privacy-related enquiries, please contact:
        </p>
        <p>
          <strong>Into The Wild Marketing</strong><br />
          Australia<br />
          Email:{' '}
          <a href="mailto:privacy@lyraonline.ai" className="text-text-primary hover:text-accent-platinum transition-colors">
            privacy@lyraonline.ai
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
      <div className="space-y-3 font-sans text-sm text-text-secondary leading-relaxed [&_ul]:space-y-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-text-tertiary [&_strong]:text-text-primary [&_em]:italic">
        {children}
      </div>
    </section>
  )
}
