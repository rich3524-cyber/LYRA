import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/api/auth/login')
}
