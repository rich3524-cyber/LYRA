import * as cheerio from 'cheerio'

export interface ScoreDimension {
  score: number
  max: number
  note: string
}

export interface PageAnalysis {
  url: string
  title: string | null
  metaDescription: string | null
  h1: string | null
  seoScore: number
  scoreBreakdown: {
    title: ScoreDimension
    metaDescription: ScoreDimension
    h1: ScoreDimension
    headingStructure: ScoreDimension
  }
}

function scoreTitle(title: string | null): ScoreDimension {
  if (!title) return { score: 0, max: 25, note: 'Missing — add a title tag' }
  const len = title.length
  if (len >= 50 && len <= 60) return { score: 25, max: 25, note: `Good length (${len} chars)` }
  if (len > 0 && len < 50) return { score: 15, max: 25, note: `Too short — ${len} chars, aim for 50–60` }
  if (len > 60 && len <= 70) return { score: 15, max: 25, note: `Slightly long — ${len} chars, aim for 50–60` }
  return { score: 5, max: 25, note: `Too long — ${len} chars, aim for 50–60` }
}

function scoreMeta(meta: string | null): ScoreDimension {
  if (!meta) return { score: 0, max: 25, note: 'Missing — add a meta description' }
  const len = meta.length
  if (len >= 120 && len <= 160) return { score: 25, max: 25, note: `Good length (${len} chars)` }
  if (len > 0 && len < 120) return { score: 15, max: 25, note: `Too short — ${len} chars, aim for 120–160` }
  if (len > 160 && len <= 180) return { score: 15, max: 25, note: `Slightly long — ${len} chars, aim for 120–160` }
  return { score: 5, max: 25, note: `Too long — ${len} chars, aim for 120–160` }
}

function scoreH1(h1: string | null, h1Count: number): ScoreDimension {
  if (!h1 || h1Count === 0) return { score: 0, max: 25, note: 'Missing — add exactly one H1' }
  if (h1Count === 1) return { score: 25, max: 25, note: 'Present and unique' }
  return { score: 10, max: 25, note: `${h1Count} H1 tags found — should be exactly 1` }
}

function scoreHeadingStructure(h2Count: number, h1Present: boolean): ScoreDimension {
  if (h2Count > 0) return { score: 25, max: 25, note: `${h2Count} H2 headings — good structure` }
  if (h1Present) return { score: 10, max: 25, note: 'H1 present but no H2 subheadings' }
  return { score: 0, max: 25, note: 'No heading structure found' }
}

export async function analyzePage(url: string): Promise<PageAnalysis> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LYRA-SEO-Analyzer/1.0 (+https://lyraonline.ai)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim() || null
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null
  const h1 = $('h1').first().text().trim() || null
  const h1Count = $('h1').length
  const h2Count = $('h2').length

  const titleDim = scoreTitle(title)
  const metaDim = scoreMeta(metaDescription)
  const h1Dim = scoreH1(h1, h1Count)
  const headingDim = scoreHeadingStructure(h2Count, !!h1)

  return {
    url,
    title,
    metaDescription,
    h1,
    seoScore: titleDim.score + metaDim.score + h1Dim.score + headingDim.score,
    scoreBreakdown: {
      title: titleDim,
      metaDescription: metaDim,
      h1: h1Dim,
      headingStructure: headingDim,
    },
  }
}
