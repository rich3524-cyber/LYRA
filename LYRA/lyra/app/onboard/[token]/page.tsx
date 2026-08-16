import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { OnboardingFlow } from '@/components/lyra/onboarding/onboarding-flow'

export default async function OnboardPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const record = await prisma.onboardingToken.findUnique({
    where:   { token },
    include: { workspace: { select: { id: true, name: true, websiteUrl: true, industry: true } } },
  })

  if (!record || record.expiresAt < new Date()) notFound()

  return (
    <OnboardingFlow
      token={token}
      workspace={record.workspace}
      alreadyCompleted={!!record.completedAt}
    />
  )
}
