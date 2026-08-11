import type { ChannelMessage } from './message'

// Renders a platform-neutral ChannelMessage to Slack mrkdwn.
//
// Zernio's Slack surface is messages, files, and thread replies -- there is no
// Block Kit, so the deep link is a labelled mrkdwn link rather than a real
// button. Copy follows the CLAUDE.md voice rules: no emoji, no exclamation
// marks, one idea per sentence.

/**
 * Slack requires these three characters to be HTML-escaped in message text.
 *
 * This is a real injection guard, not cosmetics: mrkdwn link syntax is
 * `<url|label>`, so an unescaped comment containing `<https://evil.example|Click
 * here>` would render inside a LYRA alert as a genuine, LYRA-branded link the
 * reader has every reason to trust. Every piece of untrusted content -- comment
 * bodies, post excerpts, failure reasons, author names, workspace names -- goes
 * through this before it reaches the message.
 *
 * Deliberately only these three. Slack's own docs specify exactly this set; a
 * broader HTML-style escape (quotes, apostrophes) would render literal `&#39;`
 * in the channel, since Slack does not decode those.
 */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A URL is safe to place in mrkdwn link syntax only if it can't close the link early. */
function safeLinkUrl(url: string): string {
  return url.replace(/[<>|]/g, '')
}

export function formatSlackText(msg: ChannelMessage): string {
  const lines: string[] = [`*${escapeSlack(msg.title)}*`, escapeSlack(msg.summary)]

  if (msg.quote) {
    lines.push('')
    // Slack renders each `>`-prefixed line as a quote block. Escaping happens
    // first, then the prefix is applied per line, so a multi-line comment
    // stays entirely inside the quote instead of half-escaping the block.
    const quoted = escapeSlack(msg.quote.text)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    lines.push(quoted)
    if (msg.quote.attribution) {
      lines.push(`> — ${escapeSlack(msg.quote.attribution)}`)
    }
  }

  if (msg.facts?.length) {
    lines.push('')
    for (const { label, value } of msg.facts) {
      lines.push(`*${escapeSlack(label)}:* ${escapeSlack(value)}`)
    }
  }

  lines.push('')
  lines.push(`<${safeLinkUrl(msg.linkUrl)}|${escapeSlack(msg.linkLabel)}>`)

  return lines.join('\n')
}

// Per-message bot identity. Zernio documents `platforms[].platformSpecificData`
// as the per-platform options object, and documents `username`/`iconUrl` as
// Slack's identity overrides -- but its published platform guide still only
// covers the 14 platforms that predate Slack, so the two facts have not been
// documented *together*. This placement follows the documented pattern and is
// the one thing in this feature that must be confirmed against a real connected
// channel. If Zernio ignores unknown fields, messages still deliver; they just
// post under the Zernio identity instead of LYRA's.
export const SLACK_BOT_USERNAME = 'LYRA'

// Slack's icon_url historically requires a raster image -- SVG is not reliably
// rendered. All of LYRA's brand assets in public/brand are SVG, so this points
// at a PNG rendered on demand by app/brand/slack-avatar/route.tsx.
export function slackIconUrl(appBaseUrl: string): string {
  return `${appBaseUrl}/brand/slack-avatar`
}

export interface SlackPost {
  content: string
  platformSpecificData: Record<string, string>
}

export function formatSlackMessage(msg: ChannelMessage, appBaseUrl: string): SlackPost {
  return {
    content: formatSlackText(msg),
    platformSpecificData: {
      username: SLACK_BOT_USERNAME,
      iconUrl:  slackIconUrl(appBaseUrl),
    },
  }
}
