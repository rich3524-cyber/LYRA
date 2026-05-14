import { Auth0Client } from '@auth0/nextjs-auth0/server'

const appBaseUrl = (process.env.AUTH0_BASE_URL ?? process.env.APP_BASE_URL)!

export const auth0 = new Auth0Client({
  domain:       process.env.AUTH0_DOMAIN!,
  clientId:     process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  secret:       process.env.AUTH0_SECRET!,
  appBaseUrl,
  authorizationParameters: {
    redirect_uri: `${appBaseUrl}/auth/callback`,
    scope: 'openid profile email',
  },
})
