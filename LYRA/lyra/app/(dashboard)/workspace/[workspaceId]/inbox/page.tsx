import { ResponseInbox } from '@/components/lyra/inbox/response-inbox'

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#e2e2e2]">Comment Inbox</h1>
        <p className="text-sm text-[#555] mt-1">
          AI-drafted responses — review, edit, and send.
        </p>
      </div>
      <ResponseInbox workspaceId={workspaceId} />
    </div>
  )
}
