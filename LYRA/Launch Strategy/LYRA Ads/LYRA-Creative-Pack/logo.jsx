// LYRA Logo System — canonical marks rendered to spec.
//
// Per Brand Guidelines v1.0:
//   - Framed L: 1px platinum (#d8d8d8) border, square. L set in Helvetica Light.
//   - Wordmark: "YRA" in DM Sans Light, tracking +250, all caps.
//   - Combined: framed L + 12px gap + YRA (at standard digital sizes).
//   - Primary: platinum on near-black (#080808).
//   - Reversed: near-black on off-white (#f4f4f2).

const NEAR_BLACK = '#080808';
const OFF_WHITE  = '#f4f4f2';
const PLATINUM   = '#d8d8d8';
const SILVER     = '#aaaaaa';
const TEXT_SEC   = '#888888';
const TEXT_TER   = '#555555';
const BORDER_SUB = '#222222';
const BORDER_MID = '#333333';

// ─── core mark ────────────────────────────────────────────────────────────────
// scale drives every dimension proportionally so the mark scales cleanly from
// favicon to hero. `size` is the framed-L edge length in px.

const Helv = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const DMSans = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
const Mono   = "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace";
const Serif  = "'Instrument Serif', Georgia, serif";

// Framed L — the standalone icon.
function FramedL({ size = 64, fg = PLATINUM, bg = NEAR_BLACK, borderWidth }) {
  // Border scales subtly with size, but never below 1px and never above 2px
  // (spec is "1px platinum" at standard digital sizes).
  const bw = borderWidth ?? Math.max(1, Math.min(2, Math.round(size / 64)));
  return (
    <div
      style={{
        width:  size,
        height: size,
        border: `${bw}px solid ${fg}`,
        background: bg,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        boxSizing: 'border-box',
        flex: '0 0 auto',
      }}
    >
      <span
        style={{
          fontFamily: Helv,
          fontWeight: 300,
          color: fg,
          // L sits inside the frame — visually balanced to occupy ~70% of edge.
          fontSize: size * 0.78,
          lineHeight: 0.78,
          paddingLeft:  size * 0.14,
          paddingBottom: size * 0.06,
          letterSpacing: '-0.04em',
          userSelect: 'none',
        }}
      >L</span>
    </div>
  );
}

// Wordmark — "YRA" only (the L is supplied by the frame).
function Wordmark({ size = 64, fg = PLATINUM }) {
  return (
    <span
      style={{
        fontFamily: DMSans,
        fontWeight: 300,
        color: fg,
        // Match the L's optical height inside the frame.
        fontSize: size * 0.78,
        lineHeight: 1,
        // Spec: tracking +250 (thousandths of an em) = 0.25em.
        letterSpacing: '0.25em',
        // Trim the trailing tracking so the right edge feels balanced.
        marginRight: `-0.25em`,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >YRA</span>
  );
}

// Combined mark — framed L + 12px gap + wordmark. `size` is framed-L edge.
function LogoLockup({ size = 64, fg = PLATINUM, bg = NEAR_BLACK }) {
  // Spec gap is 12px at standard digital sizes (size ~ 64). Scale linearly.
  const gap = (12 / 64) * size;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap, background: bg }}>
      <FramedL size={size} fg={fg} bg={bg} />
      <Wordmark size={size} fg={fg} />
    </div>
  );
}

// ─── canvas chrome ────────────────────────────────────────────────────────────

const card = (extra = {}) => ({
  background: NEAR_BLACK,
  border: `1px solid ${BORDER_SUB}`,
  borderRadius: 14,
  padding: 0,
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  position: 'relative',
  boxSizing: 'border-box',
  ...extra,
});

const lightCard = (extra = {}) => ({
  ...card(),
  background: OFF_WHITE,
  border: `1px solid #e6e4de`,
  ...extra,
});

const eyebrow = {
  fontFamily: DMSans,
  fontWeight: 500,
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: TEXT_SEC,
};

const metaRow = (label, value) => (
  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderTop: `1px solid ${BORDER_SUB}` }}>
    <span style={{ ...eyebrow, color: TEXT_TER }}>{label}</span>
    <span style={{ fontFamily: Mono, fontSize: 12, color: PLATINUM }}>{value}</span>
  </div>
);

// ─── artboards ────────────────────────────────────────────────────────────────

function HeroPrimary() {
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ position: 'absolute', top: 24, left: 28, ...eyebrow }}>01 · Primary mark</div>
      <div style={{ position: 'absolute', top: 24, right: 28, ...eyebrow, color: TEXT_TER }}>Platinum on near-black</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LogoLockup size={160} />
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}`, display: 'flex', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 8 }}>Foreground</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>#D8D8D8 · platinum</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 8 }}>Background</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>#080808 · near-black</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 8 }}>Lockup gap</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>12px @ 64</div>
        </div>
      </div>
    </div>
  );
}

function HeroReversed() {
  return (
    <div style={lightCard({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ position: 'absolute', top: 24, left: 28, ...eyebrow, color: '#666' }}>02 · Reversed</div>
      <div style={{ position: 'absolute', top: 24, right: 28, ...eyebrow, color: '#999' }}>Near-black on off-white</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LogoLockup size={160} fg={NEAR_BLACK} bg={OFF_WHITE} />
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid #e6e4de`, display: 'flex', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: '#999', marginBottom: 8 }}>Foreground</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: NEAR_BLACK }}>#080808 · near-black</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: '#999', marginBottom: 8 }}>Background</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: NEAR_BLACK }}>#F4F4F2 · off-white</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: '#999', marginBottom: 8 }}>Stroke</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: NEAR_BLACK }}>1px solid</div>
        </div>
      </div>
    </div>
  );
}

function FramedIconStandalone() {
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ position: 'absolute', top: 24, left: 28, ...eyebrow }}>03 · Standalone icon</div>
      <div style={{ position: 'absolute', top: 24, right: 28, ...eyebrow, color: TEXT_TER }}>App · avatar · favicon</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FramedL size={220} />
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}` }}>
        <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Use</div>
        <div style={{ fontFamily: DMSans, fontSize: 13, color: PLATINUM, lineHeight: 1.5 }}>
          The framed L stands alone as app icon, favicon, and avatar. The wordmark is never used without it.
        </div>
      </div>
    </div>
  );
}

// Scale-down strip showing the mark at canonical sizes.
function ScaleStrip() {
  const sizes = [16, 24, 32, 48, 64, 96, 128];
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>04 · Scale</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', gap: 16 }}>
        {sizes.map(s => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <FramedL size={s} />
            <span style={{ fontFamily: Mono, fontSize: 11, color: TEXT_SEC }}>{s}px</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}`, display: 'flex', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Min digital · full mark</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>120px</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Min digital · icon</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>32px</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Favicon set</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>16 · 32 · 192</div>
        </div>
      </div>
    </div>
  );
}

// Clear space diagram — equal to the height of the framed L on all sides.
function ClearSpace() {
  const S = 80;            // framed-L edge
  const gap = (12 / 64) * S;
  const clear = S;         // clear space = framed-L height per spec
  const guide = 'rgba(216,216,216,0.18)';
  const guideStrong = 'rgba(216,216,216,0.32)';

  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>05 · Clear space</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', padding: clear, border: `1px dashed ${guide}` }}>
          {/* dimension markers */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: clear, height: '100%',
            borderRight: `1px dashed ${guide}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: Mono, fontSize: 11, color: TEXT_SEC, writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>X</div>
          <div style={{
            position: 'absolute', right: 0, top: 0, width: clear, height: '100%',
            borderLeft: `1px dashed ${guide}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: Mono, fontSize: 11, color: TEXT_SEC, writingMode: 'vertical-rl',
          }}>X</div>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: clear, width: '100%',
            borderBottom: `1px dashed ${guide}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: Mono, fontSize: 11, color: TEXT_SEC,
          }}>X</div>
          <div style={{
            position: 'absolute', left: 0, bottom: 0, height: clear, width: '100%',
            borderTop: `1px dashed ${guide}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: Mono, fontSize: 11, color: TEXT_SEC,
          }}>X</div>
          <LogoLockup size={S} />
        </div>
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}` }}>
        <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Rule</div>
        <div style={{ fontFamily: DMSans, fontSize: 13, color: PLATINUM, lineHeight: 1.5 }}>
          Clear space (X) equals the height of the framed L. No element may cross this boundary.
        </div>
      </div>
    </div>
  );
}

// Construction diagram for the framed L — proportions & gap.
function Construction() {
  const S = 200;
  const gap = (12 / 64) * S;
  const guide = 'rgba(216,216,216,0.20)';
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>06 · Construction</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <FramedL size={S} />
            {/* horizontal guide through L baseline */}
            <div style={{ position: 'absolute', left: -40, right: -40, bottom: S * 0.06, borderTop: `1px dashed ${guide}` }} />
            {/* vertical guide */}
            <div style={{ position: 'absolute', top: -40, bottom: -40, left: S * 0.14, borderLeft: `1px dashed ${guide}` }} />
            <span style={{ position: 'absolute', top: -30, left: 0, fontFamily: Mono, fontSize: 11, color: TEXT_SEC }}>1Y × 1Y</span>
          </div>
          <Wordmark size={S} />
          {/* gap label */}
          <div style={{ position: 'absolute', top: -28, left: S, width: gap, textAlign: 'center', fontFamily: Mono, fontSize: 11, color: TEXT_SEC }}>
            ¹⁄₅ Y
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}`, display: 'flex', gap: 32 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Frame</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>Y × Y · 1px stroke</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>L letterform</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>Helvetica Light</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>YRA</div>
          <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>DM Sans Light · +250</div>
        </div>
      </div>
    </div>
  );
}

// ─── applications ─────────────────────────────────────────────────────────────

function AppIconTile() {
  // iOS/macOS-style rounded-rect app icon with the framed L centered.
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>07 · App icon</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <div style={{ width: 200, height: 200, borderRadius: 44, background: NEAR_BLACK, border: `1px solid ${BORDER_SUB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
          <FramedL size={108} />
        </div>
        <div style={{ width: 120, height: 120, borderRadius: 26, background: NEAR_BLACK, border: `1px solid ${BORDER_SUB}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FramedL size={66} />
        </div>
        <div style={{ width: 64, height: 64, borderRadius: 14, background: NEAR_BLACK, border: `1px solid ${BORDER_SUB}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FramedL size={36} />
        </div>
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}` }}>
        <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Container</div>
        <div style={{ fontFamily: DMSans, fontSize: 13, color: PLATINUM, lineHeight: 1.5 }}>
          When platforms require a tile, the framed L sits inside a near-black rounded-rect. The frame is preserved at all sizes.
        </div>
      </div>
    </div>
  );
}

function FaviconTab() {
  // Mock browser tab with the favicon.
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>08 · Favicon · browser tab</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 28px' }}>
        <div style={{ width: '100%', maxWidth: 520 }}>
          {/* tab shape */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px 12px',
              background: '#141414',
              border: `1px solid ${BORDER_SUB}`,
              borderBottom: 'none',
              borderTopLeftRadius: 10, borderTopRightRadius: 10,
              minWidth: 220,
            }}>
              <FramedL size={16} />
              <span style={{ fontFamily: DMSans, fontSize: 12, color: PLATINUM }}>LYRA · Dashboard</span>
              <span style={{ marginLeft: 'auto', color: TEXT_TER, fontSize: 14, lineHeight: 1 }}>×</span>
            </div>
          </div>
          <div style={{ height: 36, background: '#141414', border: `1px solid ${BORDER_SUB}`, borderRadius: '0 10px 10px 10px', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BORDER_MID }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BORDER_MID }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BORDER_MID }} />
            <span style={{ fontFamily: Mono, fontSize: 11, color: TEXT_TER, marginLeft: 12 }}>lyraonline.ai</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}`, display: 'flex', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <FramedL size={16} />
          <span style={{ fontFamily: Mono, fontSize: 10, color: TEXT_TER }}>16</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <FramedL size={32} />
          <span style={{ fontFamily: Mono, fontSize: 10, color: TEXT_TER }}>32</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <FramedL size={64} />
          <span style={{ fontFamily: Mono, fontSize: 10, color: TEXT_TER }}>64</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ alignSelf: 'flex-end' }}>
          <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Format</div>
          <div style={{ fontFamily: Mono, fontSize: 12, color: PLATINUM }}>ICO · PNG · SVG</div>
        </div>
      </div>
    </div>
  );
}

function AvatarRow() {
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>09 · Social avatar</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        {[120, 88, 64, 44, 32].map(s => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: s, height: s, borderRadius: '50%', background: NEAR_BLACK, border: `1px solid ${BORDER_SUB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <FramedL size={Math.round(s * 0.56)} />
            </div>
            <span style={{ fontFamily: Mono, fontSize: 11, color: TEXT_SEC }}>{s}px</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}` }}>
        <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Handles</div>
        <div style={{ fontFamily: Mono, fontSize: 13, color: PLATINUM }}>@lyraonline · LinkedIn · Instagram · X · TikTok</div>
      </div>
    </div>
  );
}

function BusinessCard() {
  // Front + back of a card to demonstrate the system on a real artefact.
  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>10 · Business card · 85 × 55 mm</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        {/* front */}
        <div style={{
          width: 340, height: 220,
          background: NEAR_BLACK,
          border: `1px solid ${BORDER_SUB}`,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
        }}>
          <LogoLockup size={56} />
        </div>
        {/* back */}
        <div style={{
          width: 340, height: 220,
          background: NEAR_BLACK,
          border: `1px solid ${BORDER_SUB}`,
          borderRadius: 6,
          padding: 24,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          boxShadow: '0 30px 60px rgba(0,0,0,0.45)',
        }}>
          <FramedL size={24} />
          <div>
            <div style={{ fontFamily: DMSans, fontWeight: 500, fontSize: 14, color: PLATINUM }}>Jess Williams</div>
            <div style={{ fontFamily: DMSans, fontWeight: 400, fontSize: 12, color: TEXT_SEC, marginTop: 2 }}>Account Director</div>
            <div style={{ height: 1, background: BORDER_MID, margin: '14px 0 12px', width: 40 }} />
            <div style={{ fontFamily: DMSans, fontSize: 10, color: TEXT_SEC, letterSpacing: '0.32em' }}>LYRA</div>
            <div style={{ fontFamily: Mono, fontSize: 10, color: TEXT_TER, marginTop: 4 }}>lyraonline.ai</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', borderTop: `1px solid ${BORDER_SUB}` }}>
        <div style={{ ...eyebrow, color: TEXT_TER, marginBottom: 6 }}>Stock</div>
        <div style={{ fontFamily: DMSans, fontSize: 13, color: PLATINUM, lineHeight: 1.5 }}>
          Uncoated near-black 350gsm · platinum hot-foil mark · single side foil only.
        </div>
      </div>
    </div>
  );
}

function ProhibitedUses() {
  // Don't-do examples with a slash through them.
  const Cross = ({ children, label }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: 130, background: '#0f0f0f', border: `1px solid ${BORDER_SUB}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {children}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1="0" y1="100%" x2="100%" y2="0" stroke="#f87171" strokeWidth="1.5" />
        </svg>
      </div>
      <span style={{ fontFamily: DMSans, fontWeight: 400, fontSize: 12, color: TEXT_SEC, textAlign: 'center', lineHeight: 1.4 }}>{label}</span>
    </div>
  );

  return (
    <div style={card({ display: 'flex', flexDirection: 'column' })}>
      <div style={{ padding: '24px 28px 0', ...eyebrow }}>11 · Don't</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 24px', gap: 18 }}>
        <Cross label="Don't recolour">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 56, height: 56, border: `1px solid #60a5fa`, color: '#60a5fa', fontFamily: Helv, fontWeight: 300, fontSize: 44, lineHeight: 0.78, display: 'flex', alignItems: 'flex-end', paddingLeft: 8, paddingBottom: 4, boxSizing: 'border-box' }}>L</div>
            <span style={{ fontFamily: DMSans, fontWeight: 300, fontSize: 44, letterSpacing: '0.25em', color: '#60a5fa', marginRight: '-0.25em' }}>YRA</span>
          </div>
        </Cross>
        <Cross label="Don't remove the frame">
          <span style={{ fontFamily: DMSans, fontWeight: 300, fontSize: 44, letterSpacing: '0.25em', color: PLATINUM, marginRight: '-0.25em' }}>LYRA</span>
        </Cross>
        <Cross label="Don't change the wordmark">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <FramedL size={56} />
            <span style={{ fontFamily: Serif, fontStyle: 'italic', fontSize: 44, color: PLATINUM }}>YRA</span>
          </div>
        </Cross>
        <Cross label="Don't add effects">
          <div style={{ filter: 'drop-shadow(0 0 14px rgba(216,216,216,0.7))' }}>
            <LogoLockup size={56} />
          </div>
        </Cross>
        <Cross label="Don't rotate">
          <div style={{ transform: 'rotate(-12deg)' }}>
            <LogoLockup size={56} />
          </div>
        </Cross>
      </div>
    </div>
  );
}

// ─── canvas composition ───────────────────────────────────────────────────────

function App() {
  return (
    <DesignCanvas>
      <DCSection id="marks" title="Marks" subtitle="Primary, reversed, and standalone icon">
        <DCArtboard id="primary"  label="Primary lockup"     width={820} height={520}><HeroPrimary /></DCArtboard>
        <DCArtboard id="reversed" label="Reversed lockup"    width={820} height={520}><HeroReversed /></DCArtboard>
        <DCArtboard id="icon"     label="Standalone icon"    width={520} height={520}><FramedIconStandalone /></DCArtboard>
      </DCSection>

      <DCSection id="system" title="System" subtitle="Scale, clear space, construction">
        <DCArtboard id="scale"        label="Scale"        width={1080} height={360}><ScaleStrip /></DCArtboard>
        <DCArtboard id="clearspace"   label="Clear space"  width={520}  height={520}><ClearSpace /></DCArtboard>
        <DCArtboard id="construction" label="Construction" width={820}  height={520}><Construction /></DCArtboard>
      </DCSection>

      <DCSection id="applications" title="Applications" subtitle="Real-world artefacts">
        <DCArtboard id="appicon"  label="App icon"       width={820} height={420}><AppIconTile /></DCArtboard>
        <DCArtboard id="favicon"  label="Favicon · tab"  width={680} height={420}><FaviconTab /></DCArtboard>
        <DCArtboard id="avatar"   label="Social avatar"  width={820} height={360}><AvatarRow /></DCArtboard>
        <DCArtboard id="card"     label="Business card"  width={820} height={420}><BusinessCard /></DCArtboard>
      </DCSection>

      <DCSection id="rules" title="Rules" subtitle="Common misuses to avoid">
        <DCArtboard id="dont" label="Prohibited uses" width={1200} height={360}><ProhibitedUses /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
