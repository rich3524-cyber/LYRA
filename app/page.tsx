import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'

export default async function RootPage() {
  const session = await auth0.getSession()
  if (session?.user) {
    redirect('/dashboard')
  }
  redirect('/auth/login')
}
