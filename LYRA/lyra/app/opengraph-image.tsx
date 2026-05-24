import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'LYRA — AI Social Media Intelligence'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#080808',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient radial glow */}
        <div
          style={{
            position: 'absolute',
            width: 800,
            height: 500,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at center, rgba(170,170,170,0.07) 0%, transparent 65%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Logo mark + wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 36,
          }}
        >
          {/* Framed L */}
          <div
            style={{
              width: 60,
              height: 60,
              border: '2px solid #aaaaaa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 20,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: '#e2e2e2',
                fontSize: 38,
                fontFamily: 'Georgia, serif',
                fontWeight: 400,
                lineHeight: 1,
              }}
            >
              L
            </span>
          </div>
          {/* YRA */}
          <span
            style={{
              color: '#e2e2e2',
              fontSize: 46,
              letterSpacing: '0.3em',
              fontWeight: 300,
              fontFamily: 'Arial, sans-serif',
            }}
          >
            YRA
          </span>
        </div>

        {/* Separator line */}
        <div
          style={{
            width: 48,
            height: 1,
            background: '#333333',
            marginBottom: 32,
          }}
        />

        {/* Tagline */}
        <p
          style={{
            color: '#888888',
            fontSize: 24,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 400,
            textAlign: 'center',
            maxWidth: 680,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          AI Social Media Intelligence
        </p>

        {/* Domain */}
        <p
          style={{
            position: 'absolute',
            bottom: 52,
            color: '#444444',
            fontSize: 15,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 400,
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          lyraonline.ai
        </p>
      </div>
    ),
    { ...size }
  )
}
