// Auth is handled server-side in app/(dashboard)/layout.tsx and app/auth/[auth0]/route.ts
// No edge processing needed — pass all requests through to the Next.js server handler
export function proxy(_request: Request) {
  return
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
