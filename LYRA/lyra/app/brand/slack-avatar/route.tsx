import { ImageResponse } from 'next/og'

// Bot avatar for LYRA's Slack notification messages, served as a PNG.
//
// Every brand asset in public/brand is SVG, and Slack's icon_url does not
// reliably render SVG, so this renders the app-icon mark to a raster image on
// demand using the same next/og pattern as app/opengraph-image.tsx.
//
// Per the brand rules: the app icon is the framed L alone, no wordmark --
// platinum #aaaaaa frame, #e2e2e2 L, on #080808.

export const runtime = 'edge'

const SIZE = 512

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width:           '100%',
          height:          '100%',
          background:      '#080808',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
        }}
      >
        <div
          style={{
            width:          300,
            height:         300,
            border:         '12px solid #aaaaaa',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color:      '#e2e2e2',
              fontSize:   190,
              fontFamily: 'Georgia, serif',
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            L
          </span>
        </div>
      </div>
    ),
    {
      width:   SIZE,
      height:  SIZE,
      headers: {
        // Slack fetches and caches this itself; a long TTL keeps it off the
        // edge function on every message.
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    }
  )
}
