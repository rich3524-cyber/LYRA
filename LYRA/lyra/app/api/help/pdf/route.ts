import { NextResponse } from 'next/server'

// Allow up to 60 seconds — Puppeteer + page render takes 10–20s on cold start
export const maxDuration = 60
export const dynamic = 'force-dynamic'

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

export async function GET() {
  let browser: import('puppeteer-core').Browser | null = null

  try {
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

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="LYRA-Help-Guide.pdf"',
        'Cache-Control': 'public, max-age=7200', // Cache for 2 hours
      },
    })
  } catch (error) {
    if (browser) await browser.close().catch(() => null)
    console.error('[help/pdf] Generation failed:', error)
    return NextResponse.json(
      {
        error: 'PDF generation failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
