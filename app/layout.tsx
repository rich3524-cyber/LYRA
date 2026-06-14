import type { Metadata } from 'next'
import { DM_Sans, Instrument_Serif, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { NavigationLoader } from '@/components/lyra/app-shell/navigation-loader'
import './globals.css'

const GTM_ID  = 'GTM-KH28ZQGJ'
const GA_ID   = 'G-ZX3Y84SH8T'
const META_ID = '1016046914329329'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
})

const SITE_URL = 'https://lyraonline.ai'
const SITE_NAME = 'LYRA'
const SITE_DESCRIPTION =
  'LYRA automates social media for agencies and freelancers. Schedule posts, generate on-brand AI captions, and respond to comments autonomously — 24 hours a day.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'LYRA — AI Social Media Intelligence',
    template: '%s | LYRA',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'social media management',
    'AI social media',
    'social media automation',
    'AI comment response',
    'social media agency tool',
    'AI caption generator',
    'social media scheduling',
    'social media management software',
  ],
  authors: [{ name: 'Into The Wild Marketing' }],
  creator: 'Into The Wild Marketing',
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'LYRA — AI Social Media Intelligence',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'LYRA — AI Social Media Intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LYRA — AI Social Media Intelligence',
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/brand/lyra-favicon.svg',
    apple: '/brand/lyra-app-icon-512.svg',
  },
  alternates: {
    canonical: SITE_URL,
  },
  other: {
    'facebook-domain-verification': '1zdz2p7z9vsq0qh3nzc2qwm36gojlu',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
        }}
      />
      {/* Google Analytics */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
        }}
      />
      {/* Meta Pixel */}
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_ID}');fbq('track','PageView');`,
        }}
      />
      <body className="min-h-full flex flex-col bg-background-primary text-text-primary">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: SITE_NAME,
                  url: SITE_URL,
                  logo: `${SITE_URL}/brand/lyra-logo-primary.svg`,
                  sameAs: [
                    'https://www.facebook.com/profile.php?id=61590029438901',
                    'https://www.instagram.com/lyra.online.social/',
                    'https://www.linkedin.com/company/lyra-online-social',
                  ],
                },
                {
                  '@type': 'SoftwareApplication',
                  name: SITE_NAME,
                  url: SITE_URL,
                  applicationCategory: 'BusinessApplication',
                  operatingSystem: 'Web',
                  description: SITE_DESCRIPTION,
                  offers: [
                    { '@type': 'Offer', name: 'Starter', price: '49', priceCurrency: 'USD' },
                    { '@type': 'Offer', name: 'Pro',     price: '149', priceCurrency: 'USD' },
                    { '@type': 'Offer', name: 'Agency',  price: '399', priceCurrency: 'USD' },
                  ],
                },
              ],
            }),
          }}
        />
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${META_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
        <NavigationLoader />
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
