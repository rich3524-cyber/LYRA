import type { Platform } from '@prisma/client'

// Confirmed against Zernio's own docs (docs_search "Instagram post media
// requirements" / "Instagram supported image formats"): Instagram's feed-post
// table lists Formats as JPEG/PNG only for Feed Post, Story, and Carousel --
// GIF and WebP are not accepted. Threads explicitly documented as sharing
// Instagram's media infrastructure ("WebP images may fail -- use JPEG or
// PNG"). Scoped to just these two platforms/formats because that's what's
// actually confirmed from the docs; other platforms' image-format tables
// weren't unambiguous enough in the search results to encode here without
// risking a wrong block on a platform that actually supports more formats.
const IMAGE_FORMAT_ALLOWLIST: Partial<Record<Platform, string[]>> = {
  INSTAGRAM: ['jpg', 'jpeg', 'png'],
  THREADS:   ['jpg', 'jpeg', 'png'],
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm']

function getExtension(url: string): string {
  const clean = url.split(/[?#]/)[0]
  const match = /\.([a-z0-9]+)$/i.exec(clean)
  return match ? match[1].toLowerCase() : ''
}

export interface MediaCompatibilityIssue {
  url:      string
  platform: Platform
  ext:      string
}

/**
 * Checks attached media against each selected platform's known image-format
 * restrictions. Only flags formats we have confirmed docs evidence for --
 * silence on a platform/format combo means "not checked", not "definitely fine".
 */
export function checkMediaCompatibility(mediaUrls: string[], platforms: Platform[]): MediaCompatibilityIssue[] {
  const issues: MediaCompatibilityIssue[] = []
  for (const url of mediaUrls) {
    const ext = getExtension(url)
    if (!ext || VIDEO_EXTENSIONS.includes(ext)) continue // video formats not covered by this check
    for (const platform of platforms) {
      const allowed = IMAGE_FORMAT_ALLOWLIST[platform]
      if (allowed && !allowed.includes(ext)) {
        issues.push({ url, platform, ext })
      }
    }
  }
  return issues
}

export function formatCompatibilityIssue(issue: MediaCompatibilityIssue): string {
  const platformLabel = issue.platform.charAt(0) + issue.platform.slice(1).toLowerCase()
  return `${platformLabel} doesn't accept .${issue.ext} images (JPEG/PNG only) -- the attached file will fail to publish there.`
}
