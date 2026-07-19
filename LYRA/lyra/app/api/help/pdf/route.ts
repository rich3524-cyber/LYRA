import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { headObjectLastModified, getObjectBuffer, putObjectBuffer } from '@/lib/s3'

// Allow up to 60 seconds — Puppeteer + page render takes 10–20s on cold start
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// This is generic product documentation, identical for every visitor (not
// per-workspace data), so it's cached in S3 and only regenerated when stale --
// matches the response's own Cache-Control freshness window instead of paying
// for a full headless-Chromium launch on every single request.
const CACHE_KEY = 'cache/help-guide.pdf'
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

async function getChromiumArgs(): Promise<string[]> {
  if (process.env.NODE_ENV === 'production') {
    const chromium = await import('@sparticuz/chromium-min')
    return chromium.default.args
  }
  return ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
}

async function getExecutablePath(): Promise<string> {
  // Explicit override takes priority (useful for CI/staging)
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH
  }

  if (process.env.NODE_ENV === 'production') {
    const chromium = await import('@sparticuz/chromium-min')
    // CHROMIUM_REMOTE_EXEC_PATH env var allows overriding the remote binary URL
    // Default: matches the installed @sparticuz/chromium-min version
    const remoteUrl =
      process.env.CHROMIUM_REMOTE_EXEC_PATH ||
      'https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.tar'
    return chromium.default.executablePath(remoteUrl)
  }

  // Local development — find Chrome on Windows or Linux
  const fs = await import('fs')
  const windowsPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
  ]
  for (const p of windowsPaths) {
    if (fs.existsSync(p)) return p
  }

  // Linux / macOS fallbacks
  const unixPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  for (const p of unixPaths) {
    if (fs.existsSync(p)) return p
  }

  throw new Error(
    'Chrome not found locally. Set CHROME_EXECUTABLE_PATH environment variable.',
  )
}

export async function GET(req: Request) {
  let browser: import('puppeteer-core').Browser | null = null

  try {
    // Unauthenticated + launches a full headless Chromium per request (10-20s each) --
    // an easy DoS/cost target without a strict per-IP cap.
    const { allowed } = await checkRateLimit(`help-pdf:${getClientIp(req)}`, 5, 600)
    if (!allowed) return rateLimitResponse()

    const cachedAt = await headObjectLastModified(CACHE_KEY)
    if (cachedAt && Date.now() - cachedAt.getTime() < CACHE_TTL_MS) {
      const cached = await getObjectBuffer(CACHE_KEY)
      return new NextResponse(new Uint8Array(cached), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="LYRA-Help-Guide.pdf"',
          'Cache-Control': 'public, max-age=7200',
          'X-Cache': 'HIT',
        },
      })
    }

    const puppeteer = await import('puppeteer-core')
    const args = await getChromiumArgs()
    const executablePath = await getExecutablePath()

    browser = await puppeteer.default.launch({
      args: [
        ...args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none', // Sharper fonts in PDF
      ],
      executablePath,
      headless: true,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://lyraonline.ai' : 'http://localhost:3000')

    await page.goto(`${baseUrl}/help-print`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })

    // Wait for all fonts to finish loading before capturing
    await page.evaluate(() => document.fonts.ready)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true, // Required for dark background
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      displayHeaderFooter: false,
    })

    await browser.close()
    browser = null

    const pdfBuffer = Buffer.from(pdf)
    await putObjectBuffer(CACHE_KEY, pdfBuffer, 'application/pdf').catch((err) =>
      console.error('[help/pdf] failed to write cache:', err)
    )

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="LYRA-Help-Guide.pdf"',
        'Cache-Control': 'public, max-age=7200', // Cache for 2 hours
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    if (browser) await browser.close().catch(() => null)
    console.error('[help/pdf] Generation failed:', error)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
