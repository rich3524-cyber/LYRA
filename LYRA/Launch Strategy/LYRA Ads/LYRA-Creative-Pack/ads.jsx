// LYRA Creative Pack — Static Ads
// 25 artboards: 16 ad creatives + 9 carousel cards · all non-video

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG    = '#080808';
const PLT   = '#d8d8d8';
const SIL   = '#aaaaaa';
const T2    = '#888888';
const T3    = '#555555';
const RUL   = '#333333';

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS  = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO  = "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace";

// ── Logo components ───────────────────────────────────────────────────────────

function LogoIcon({ size = 36 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <rect x="10" y="10" width="44" height="44" fill={BG} stroke={SIL} strokeWidth="1.5" />
      <line x1="22" y1="20" x2="22" y2="44" stroke={PLT} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="44" x2="42" y2="44" stroke={PLT} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function LogoPrimary({ width = 160 }) {
  const h = Math.round(width * 100 / 320);
  return (
    <svg viewBox="0 0 320 100" width={width} height={h} style={{ display: 'block' }}>
      <rect x="32" y="26" width="48" height="48" fill={BG} stroke={SIL} strokeWidth="1.5" />
      <line x1="48" y1="38" x2="48" y2="64" stroke={PLT} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="48" y1="64" x2="68" y2="64" stroke={PLT} strokeWidth="2.2" strokeLinecap="round" />
      <text x="94" y="58" fontFamily={SANS} fontSize="26" fontWeight="200" fill={PLT} letterSpacing="10">YRA</text>
    </svg>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const adBase = {
  width: '100%', height: '100%', background: BG,
  display: 'flex', flexDirection: 'column',
  position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
};

function AssetID({ id }) {
  return (
    <div style={{
      position: 'absolute', top: 18, left: 24,
      fontFamily: SANS, fontWeight: 500, fontSize: 9,
      letterSpacing: '0.16em', color: T3, textTransform: 'uppercase', zIndex: 2,
    }}>{id}</div>
  );
}

function CardNum({ n, total }) {
  return (
    <div style={{
      position: 'absolute', top: 20, right: 22,
      fontFamily: MONO, fontSize: 10, color: T3, letterSpacing: '0.06em',
    }}>{String(n).padStart(2, '0')}/{String(total).padStart(2, '0')}</div>
  );
}

function HR({ my = 28, w = '100%' }) {
  return <div style={{ height: 1, background: RUL, width: w, flexShrink: 0, margin: `${my}px 0` }} />;
}

function LogoCenter({ size = 24 }) {
  return (
    <div style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)' }}>
      <LogoIcon size={size} />
    </div>
  );
}

function LogoRight({ size = 22 }) {
  return (
    <div style={{ position: 'absolute', bottom: 26, right: 26 }}>
      <LogoIcon size={size} />
    </div>
  );
}

function LogoSpread({ logoW = 100 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexShrink: 0 }}>
      <LogoPrimary width={logoW} />
      <span style={{ fontFamily: MONO, fontSize: 10, color: T3 }}>lyraonline.ai</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — SIGNAL
// ─────────────────────────────────────────────────────────────────────────────

// P1-ORG-003 · Instagram 1:1 · Category statement
function Ad_P1_003() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 56 }}>
      <AssetID id="P1-ORG-003" />
      <p style={{ fontFamily: SERIF, fontSize: 48, color: PLT, textAlign: 'center', lineHeight: 1.25, margin: '0 0 20px', maxWidth: 360 }}>
        Every platform helps you post.
      </p>
      <p style={{ fontFamily: SERIF, fontSize: 48, fontStyle: 'italic', color: PLT, textAlign: 'center', lineHeight: 1.25, margin: 0, maxWidth: 360 }}>
        None help you respond.
      </p>
      <LogoCenter />
    </div>
  );
}

// P1-ORG-004 · Instagram 1:1 · Scale statement (847 / 94)
function Ad_P1_004() {
  return (
    <div style={{ ...adBase, padding: '60px 52px 80px', justifyContent: 'center' }}>
      <AssetID id="P1-ORG-004" />
      <div style={{ fontFamily: MONO, fontSize: 92, fontWeight: 400, color: PLT, lineHeight: 0.9, marginBottom: 10 }}>847</div>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 300, color: T2, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 28 }}>Comments per month</div>
      <HR my={0} />
      <div style={{ height: 24 }} />
      <div style={{ fontFamily: MONO, fontSize: 68, fontWeight: 400, color: SIL, lineHeight: 0.9, marginBottom: 10 }}>94</div>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 300, color: T3, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 28 }}>Responses</div>
      <HR my={0} />
      <div style={{ height: 24 }} />
      <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 300, color: T2, margin: 0, lineHeight: 1.65 }}>
        That's the industry average.
      </p>
      <LogoRight />
    </div>
  );
}

// P1-ORG-005 · Instagram 1:1 · Brand voice
function Ad_P1_005() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 56 }}>
      <AssetID id="P1-ORG-005" />
      <p style={{ fontFamily: SERIF, fontSize: 46, fontStyle: 'italic', color: PLT, textAlign: 'center', lineHeight: 1.25, margin: 0, maxWidth: 360 }}>
        Your brand has a voice. It should never go quiet.
      </p>
      <HR my={36} />
      <p style={{ fontFamily: SANS, fontSize: 16, fontWeight: 300, color: SIL, textAlign: 'center', lineHeight: 2.0, margin: 0, letterSpacing: '0.03em' }}>
        24 hours a day.<br />Every comment.<br />Every review.<br />Always on-brand.
      </p>
      <LogoCenter />
    </div>
  );
}

// P1-ORG-008 · Instagram 1:1 · Waitlist CTA
function Ad_P1_008() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 56 }}>
      <AssetID id="P1-ORG-008" />
      <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T2, marginBottom: 22, textAlign: 'center' }}>
        Early Access
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 54, color: PLT, textAlign: 'center', lineHeight: 1.1, margin: '0 0 32px' }}>
        Join the waitlist.
      </p>
      <HR my={0} w="56%" />
      <div style={{ height: 28 }} />
      <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 300, color: SIL, textAlign: 'center', lineHeight: 1.8, margin: 0 }}>
        LYRA launches soon. Early access members<br />get a lifetime pricing lock.
      </p>
      <LogoCenter />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — INTELLIGENCE · ORGANIC
// ─────────────────────────────────────────────────────────────────────────────

// P2-ORG-005 · Instagram 1:1 · Agency retainer
function Ad_P2_ORG_005() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 56 }}>
      <AssetID id="P2-ORG-005" />
      <p style={{ fontFamily: SERIF, fontSize: 46, fontStyle: 'italic', color: PLT, textAlign: 'center', lineHeight: 1.25, margin: 0, maxWidth: 380 }}>
        Your retainer just got 3 hours more valuable.
      </p>
      <HR my={32} />
      <p style={{ fontFamily: SANS, fontSize: 16, fontWeight: 300, color: SIL, textAlign: 'center', lineHeight: 1.75, margin: '0 0 20px' }}>
        You didn't change your pricing.<br />LYRA changed what's included.
      </p>
      <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T2 }}>
        Agency early access open
      </div>
      <LogoRight />
    </div>
  );
}

// P2-ORG-008 · Instagram 4:5 · Freelancer split-layout
function Ad_P2_ORG_008() {
  return (
    <div style={{ ...adBase, padding: 52 }}>
      <AssetID id="P2-ORG-008" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 36 }}>
        <p style={{ fontFamily: SERIF, fontSize: 44, fontStyle: 'italic', color: PLT, lineHeight: 1.25, margin: 0 }}>
          You charge for strategy.
        </p>
      </div>
      <div style={{ height: 1, background: RUL, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingTop: 36, paddingBottom: 52 }}>
        <p style={{ fontFamily: SANS, fontWeight: 500, fontSize: 26, color: PLT, lineHeight: 1.35, margin: 0 }}>
          Not for typing replies at midnight.
        </p>
      </div>
      <LogoCenter size={22} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — INTELLIGENCE · PAID META
// ─────────────────────────────────────────────────────────────────────────────

// P2-META-001 · Meta 1:1 · Agency — numbered sequence
function Ad_P2_META_001() {
  return (
    <div style={{ ...adBase, padding: '56px 52px 80px', justifyContent: 'center' }}>
      <AssetID id="P2-META-001" />
      <div style={{ fontFamily: MONO, fontSize: 72, fontWeight: 400, color: PLT, lineHeight: 0.9, marginBottom: 8 }}>1</div>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 300, color: T2, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>Account manager</div>
      <div style={{ fontFamily: MONO, fontSize: 72, fontWeight: 400, color: PLT, lineHeight: 0.9, marginBottom: 8 }}>12</div>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 300, color: T2, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>Clients</div>
      <div style={{ fontFamily: MONO, fontSize: 72, fontWeight: 400, color: PLT, lineHeight: 0.9, marginBottom: 8 }}>3,200</div>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 300, color: T2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Comments last month</div>
      <HR my={28} />
      <p style={{ fontFamily: SERIF, fontSize: 22, fontStyle: 'italic', color: PLT, margin: 0, lineHeight: 1.45 }}>
        LYRA handled 94% of them.
      </p>
      <LogoRight />
    </div>
  );
}

// P2-META-002 · Meta 1:1 · SMB — competitive gap
function Ad_P2_META_002() {
  return (
    <div style={{ ...adBase, padding: 52, justifyContent: 'center' }}>
      <AssetID id="P2-META-002" />
      <p style={{ fontFamily: SANS, fontSize: 18, fontWeight: 300, color: PLT, lineHeight: 1.6, margin: '0 0 18px' }}>
        Your competitor replied to every comment by 8am.
      </p>
      <p style={{ fontFamily: SERIF, fontSize: 46, fontStyle: 'italic', color: SIL, lineHeight: 1.2, margin: 0 }}>
        You replied to none.
      </p>
      <HR my={36} />
      <LogoSpread logoW={110} />
    </div>
  );
}

// P2-META-004 · Meta 1:1 · Freelancer paid
function Ad_P2_META_004() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: '56px 52px 80px' }}>
      <AssetID id="P2-META-004" />
      <p style={{ fontFamily: SERIF, fontSize: 44, fontStyle: 'italic', color: PLT, textAlign: 'center', lineHeight: 1.25, margin: 0 }}>
        Stop doing the work your contract doesn't cover.
      </p>
      <HR my={32} />
      <p style={{ fontFamily: SANS, fontSize: 15, fontWeight: 300, color: SIL, textAlign: 'center', lineHeight: 1.75, margin: 0 }}>
        Comment replies. Review responses.<br />11pm notifications.<br />
        Focus on the strategy your clients actually pay for.
      </p>
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <LogoPrimary width={100} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: T3 }}>lyraonline.ai</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — LAUNCH · ORGANIC
// ─────────────────────────────────────────────────────────────────────────────

// P3-ORG-001 · Instagram 1:1 · Launch day
function Ad_P3_ORG_001() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 56 }}>
      <AssetID id="P3-ORG-001" />
      <LogoPrimary width={190} />
      <p style={{ fontFamily: SERIF, fontSize: 58, color: PLT, textAlign: 'center', lineHeight: 1.05, margin: '36px 0 14px' }}>
        LYRA is live.
      </p>
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, letterSpacing: '0.22em', textTransform: 'uppercase', margin: 0, textAlign: 'center' }}>
        Social at Signal Strength
      </p>
      <HR my={28} w="56px" />
      <p style={{ fontFamily: MONO, fontSize: 11, color: T3, margin: 0 }}>lyraonline.ai</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — AGENCY CAROUSEL · P3-META-001 · 5 cards
// ─────────────────────────────────────────────────────────────────────────────

// Card 01 — numbers visual
function Ad_P3C1_01() {
  return (
    <div style={{ ...adBase, padding: '44px 40px 52px', justifyContent: 'center' }}>
      <CardNum n={1} total={5} />
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 66, fontWeight: 400, color: PLT, lineHeight: 0.9 }}>15</div>
        <div style={{ fontFamily: MONO, fontSize: 66, fontWeight: 400, color: PLT, lineHeight: 0.9 }}>2,400</div>
        <div style={{ fontFamily: MONO, fontSize: 66, fontWeight: 400, color: PLT, lineHeight: 0.9 }}>1</div>
      </div>
      <HR my={0} />
      <div style={{ height: 18 }} />
      <p style={{ fontFamily: SERIF, fontSize: 20, color: PLT, margin: '0 0 10px', lineHeight: 1.35 }}>The agency maths is broken.</p>
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, lineHeight: 1.65, margin: 0 }}>
        15 clients. 2,400 comments per month. 1 account manager. Something has to give.
      </p>
      <div style={{ position: 'absolute', bottom: 18, left: 20 }}><LogoIcon size={18} /></div>
    </div>
  );
}

// Card 02 — signal waveform visual
function Ad_P3C1_02() {
  const bars = [55, 80, 45, 95, 60, 88, 40, 72, 92, 50, 78, 65, 85, 48, 70];
  return (
    <div style={{ ...adBase, padding: '44px 40px 52px', justifyContent: 'center' }}>
      <CardNum n={2} total={5} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56, marginBottom: 22, width: '100%' }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, background: PLT, opacity: 0.15 + (i / bars.length) * 0.6, borderRadius: 2 }} />
        ))}
      </div>
      <HR my={0} />
      <div style={{ height: 18 }} />
      <p style={{ fontFamily: SERIF, fontSize: 20, color: PLT, margin: '0 0 10px', lineHeight: 1.35 }}>LYRA learns each client's brand voice.</p>
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, lineHeight: 1.65, margin: 0 }}>
        In 2 minutes. From their website, social history, and guidelines. Every response sounds exactly like them.
      </p>
      <div style={{ position: 'absolute', bottom: 18, left: 20 }}><LogoIcon size={18} /></div>
    </div>
  );
}

// Card 03 — autonomy toggle visual
function Ad_P3C1_03() {
  return (
    <div style={{ ...adBase, padding: '44px 40px 52px', justifyContent: 'center' }}>
      <CardNum n={3} total={5} />
      <div style={{ display: 'flex', gap: 6, width: '100%', marginBottom: 22 }}>
        {[['Draft', false], ['Review', false], ['Auto', true]].map(([label, active]) => (
          <div key={label} style={{ flex: 1, padding: '10px 4px', border: `1px solid ${active ? PLT : RUL}`, borderRadius: 6, textAlign: 'center' }}>
            <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 10, color: active ? PLT : T3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
          </div>
        ))}
      </div>
      <HR my={0} />
      <div style={{ height: 18 }} />
      <p style={{ fontFamily: SERIF, fontSize: 20, color: PLT, margin: '0 0 10px', lineHeight: 1.35 }}>You set the autonomy level per client.</p>
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, lineHeight: 1.65, margin: 0 }}>
        Draft and approve. Or full autonomous. Or anything between. Each client has their own setting.
      </p>
      <div style={{ position: 'absolute', bottom: 18, left: 20 }}><LogoIcon size={18} /></div>
    </div>
  );
}

// Card 04 — retainer value
function Ad_P3C1_04() {
  return (
    <div style={{ ...adBase, padding: '44px 40px 52px', justifyContent: 'center' }}>
      <CardNum n={4} total={5} />
      <p style={{ fontFamily: SERIF, fontSize: 26, fontStyle: 'italic', color: PLT, lineHeight: 1.3, margin: '0 0 16px' }}>
        Your retainer just got 3 hours more valuable.
      </p>
      <HR my={0} />
      <div style={{ height: 18 }} />
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, lineHeight: 1.7, margin: 0 }}>
        Per client. Per week. Without changing your pricing. LYRA handles the engagement. You handle the strategy.
      </p>
      <div style={{ position: 'absolute', bottom: 18, left: 20 }}><LogoIcon size={18} /></div>
    </div>
  );
}

// Card 05 — CTA
function Ad_P3C1_05() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <CardNum n={5} total={5} />
      <LogoPrimary width={130} />
      <p style={{ fontFamily: SERIF, fontSize: 36, color: PLT, textAlign: 'center', margin: '28px 0 10px', lineHeight: 1.2 }}>
        14 days free.
      </p>
      <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 300, color: SIL, textAlign: 'center', margin: 0 }}>
        No credit card required.
      </p>
      <HR my={24} w="48px" />
      <p style={{ fontFamily: MONO, fontSize: 11, color: T3, margin: 0 }}>lyraonline.ai/trial</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — SMB CAROUSEL · P3-META-002 · 4 cards
// ─────────────────────────────────────────────────────────────────────────────

function SmbCard({ n, headline, body, italic = false }) {
  return (
    <div style={{ ...adBase, padding: '44px 40px 52px', justifyContent: 'center' }}>
      <CardNum n={n} total={4} />
      <p style={{ fontFamily: SERIF, fontSize: italic ? 24 : 22, fontStyle: italic ? 'italic' : 'normal', color: PLT, lineHeight: 1.3, margin: '0 0 16px' }}>
        {headline}
      </p>
      <HR my={0} />
      <div style={{ height: 18 }} />
      <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 300, color: SIL, lineHeight: 1.7, margin: 0 }}>
        {body}
      </p>
      <div style={{ position: 'absolute', bottom: 18, left: 20 }}><LogoIcon size={18} /></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — DIRECT RESPONSE · P3-META-003 · 4:5
// ─────────────────────────────────────────────────────────────────────────────

function Ad_P3_META_003() {
  return (
    <div style={{ ...adBase, padding: 52 }}>
      <AssetID id="P3-META-003" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p style={{ fontFamily: SERIF, fontSize: 44, color: PLT, lineHeight: 1.2, margin: '0 0 24px' }}>
          14 days free. No credit card. See LYRA learn your brand.
        </p>
        <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 300, color: SIL, lineHeight: 1.75, margin: 0 }}>
          The only social media platform that responds to your audience automatically. Always on-brand. Always on.
        </p>
      </div>
      <HR my={0} />
      <div style={{ height: 20 }} />
      <LogoSpread logoW={108} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4 — ACTIVATION
// ─────────────────────────────────────────────────────────────────────────────

// P4-META-001 · Meta 4:5 · Pricing page visitors
function Ad_P4_META_001() {
  return (
    <div style={{ ...adBase, padding: 52 }}>
      <AssetID id="P4-META-001" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p style={{ fontFamily: SERIF, fontSize: 42, color: PLT, lineHeight: 1.25, margin: '0 0 24px' }}>
          You've seen the pricing. Here's the 14-day trial.
        </p>
        <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500, color: SIL, margin: 0, letterSpacing: '0.01em' }}>
          No credit card required.
        </p>
      </div>
      <HR my={0} />
      <div style={{ height: 20 }} />
      <LogoSpread logoW={100} />
    </div>
  );
}

// P4-META-002 · Meta 1:1 · Video viewers 50%+
function Ad_P4_META_002() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: '56px 52px 80px' }}>
      <AssetID id="P4-META-002" />
      <p style={{ fontFamily: SERIF, fontSize: 42, color: PLT, textAlign: 'center', lineHeight: 1.25, margin: '0 0 16px' }}>
        You saw what LYRA can do.
      </p>
      <p style={{ fontFamily: SERIF, fontSize: 42, fontStyle: 'italic', color: SIL, textAlign: 'center', lineHeight: 1.25, margin: 0 }}>
        Now try it on your own accounts.
      </p>
      <HR my={32} />
      <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 300, color: SIL, textAlign: 'center', margin: 0 }}>
        14 days free. No card required.
      </p>
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <LogoPrimary width={96} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: T3 }}>lyraonline.ai</span>
      </div>
    </div>
  );
}

// P4-META-003 · Meta 1:1 · Lookalike converters
function Ad_P4_META_003() {
  return (
    <div style={{ ...adBase, alignItems: 'center', justifyContent: 'center', padding: '56px 52px 80px' }}>
      <AssetID id="P4-META-003" />
      <p style={{ fontFamily: SERIF, fontSize: 46, color: PLT, textAlign: 'center', lineHeight: 1.25, margin: 0 }}>
        Every comment.<br />Every review.<br /><em>Always on-brand.</em>
      </p>
      <div style={{ height: 1, background: RUL, width: 52, margin: '32px auto' }} />
      <p style={{ fontFamily: SANS, fontSize: 14, fontWeight: 300, color: SIL, textAlign: 'center', lineHeight: 1.75, margin: 0 }}>
        The social media platform that never stops working for your brand. Try it free for 14 days.
      </p>
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        <LogoPrimary width={96} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: T3 }}>lyraonline.ai</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS COMPOSITION
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const SQ  = 500;                // 1:1 artboard display size
  const PW  = 400; const PH = 500; // 4:5 artboard display
  const CAR = 380;                // carousel card

  return (
    <DesignCanvas>

      <DCSection id="p1" title="Phase 1 — Signal" subtitle="Instagram organic · 4 static ads · 1080×1080px">
        <DCArtboard id="a1" label="P1-ORG-003 · Category Statement" width={SQ} height={SQ}><Ad_P1_003 /></DCArtboard>
        <DCArtboard id="a2" label="P1-ORG-004 · Scale Statement" width={SQ} height={SQ}><Ad_P1_004 /></DCArtboard>
        <DCArtboard id="a3" label="P1-ORG-005 · Brand Voice" width={SQ} height={SQ}><Ad_P1_005 /></DCArtboard>
        <DCArtboard id="a4" label="P1-ORG-008 · Waitlist CTA" width={SQ} height={SQ}><Ad_P1_008 /></DCArtboard>
      </DCSection>

      <DCSection id="p2org" title="Phase 2 — Intelligence · Organic" subtitle="Instagram organic · 2 static ads">
        <DCArtboard id="b1" label="P2-ORG-005 · Agency Retainer · 1:1" width={SQ} height={SQ}><Ad_P2_ORG_005 /></DCArtboard>
        <DCArtboard id="b2" label="P2-ORG-008 · Freelancer · 4:5" width={PW} height={PH}><Ad_P2_ORG_008 /></DCArtboard>
      </DCSection>

      <DCSection id="p2paid" title="Phase 2 — Intelligence · Paid" subtitle="Meta Facebook + Instagram Feed · 3 static ads · Awareness">
        <DCArtboard id="c1" label="P2-META-001 · Agency · 1:1" width={SQ} height={SQ}><Ad_P2_META_001 /></DCArtboard>
        <DCArtboard id="c2" label="P2-META-002 · SMB · 1:1" width={SQ} height={SQ}><Ad_P2_META_002 /></DCArtboard>
        <DCArtboard id="c3" label="P2-META-004 · Freelancer · 1:1" width={SQ} height={SQ}><Ad_P2_META_004 /></DCArtboard>
      </DCSection>

      <DCSection id="p3org" title="Phase 3 — Launch Day" subtitle="All platforms · simultaneous · Instagram visual">
        <DCArtboard id="d1" label="P3-ORG-001 · Launch Day · 1:1" width={SQ} height={SQ}><Ad_P3_ORG_001 /></DCArtboard>
      </DCSection>

      <DCSection id="p3c1" title="Phase 3 — Agency Carousel · P3-META-001" subtitle="Meta Facebook + Instagram · 5 cards · 1:1 · Consideration · Warm audiences">
        <DCArtboard id="e1" label="01/05 · The agency maths" width={CAR} height={CAR}><Ad_P3C1_01 /></DCArtboard>
        <DCArtboard id="e2" label="02/05 · LYRA learns voice" width={CAR} height={CAR}><Ad_P3C1_02 /></DCArtboard>
        <DCArtboard id="e3" label="03/05 · Autonomy level" width={CAR} height={CAR}><Ad_P3C1_03 /></DCArtboard>
        <DCArtboard id="e4" label="04/05 · Retainer value" width={CAR} height={CAR}><Ad_P3C1_04 /></DCArtboard>
        <DCArtboard id="e5" label="05/05 · CTA card" width={CAR} height={CAR}><Ad_P3C1_05 /></DCArtboard>
      </DCSection>

      <DCSection id="p3c2" title="Phase 3 — SMB Carousel · P3-META-002" subtitle="Meta Facebook + Instagram · 4 cards · 1:1 · Consideration">
        <DCArtboard id="f1" label="01/04 · 23 comments. 0 replies." width={CAR} height={CAR}>
          <SmbCard n={1} headline="23 comments. 0 replies. That's your last post." body="Your audience asked questions, left feedback, and mentioned their friends. You answered none of them. Not because you didn't want to. Because there weren't enough hours." />
        </DCArtboard>
        <DCArtboard id="f2" label="02/04 · LYRA responds for you" width={CAR} height={CAR}>
          <SmbCard n={2} headline="LYRA responds for you. In your voice." body="It learns how your brand speaks — the tone, the warmth, the vocabulary. Then it responds to every comment, every review, automatically. 24 hours a day." />
        </DCArtboard>
        <DCArtboard id="f3" label="03/04 · You stay in control" width={CAR} height={CAR}>
          <SmbCard n={3} headline="You stay in control." body="Every response comes through for your approval, or LYRA handles it autonomously — you decide. Adjust any reply before it goes live. Or let it run." />
        </DCArtboard>
        <DCArtboard id="f4" label="04/04 · 14 days free" width={CAR} height={CAR}>
          <SmbCard n={4} headline="14 days free. No card needed." body="Try LYRA on your next post. See what happens when every comment gets a reply." italic={true} />
        </DCArtboard>
      </DCSection>

      <DCSection id="p3dr" title="Phase 3 — Direct Response · P3-META-003" subtitle="Meta Feed · 4:5 · Conversion · Hot retargeting — site visitors last 7 days">
        <DCArtboard id="g1" label="P3-META-003 · Direct Response · 4:5" width={PW} height={PH}><Ad_P3_META_003 /></DCArtboard>
      </DCSection>

      <DCSection id="p4" title="Phase 4 — Activation" subtitle="Meta retargeting + lookalike · 3 static ads · Conversion">
        <DCArtboard id="h1" label="P4-META-001 · Pricing page visitors · 4:5" width={PW} height={PH}><Ad_P4_META_001 /></DCArtboard>
        <DCArtboard id="h2" label="P4-META-002 · Video viewers 50%+ · 1:1" width={SQ} height={SQ}><Ad_P4_META_002 /></DCArtboard>
        <DCArtboard id="h3" label="P4-META-003 · Lookalike converters · 1:1" width={SQ} height={SQ}><Ad_P4_META_003 /></DCArtboard>
      </DCSection>

    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
