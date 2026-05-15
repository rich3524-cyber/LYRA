import { Search } from 'lucide-react'

interface Props {
  workspaceId: string
  workspaceName: string
  error?: string
}

export function SeoConnect({ workspaceId, workspaceName, error }: Props) {
  return (
    <div className="max-w-xl space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-4xl text-text-primary">SEO</h1>
        <p className="font-sans text-sm text-text-secondary">{workspaceName}</p>
      </div>

      {error === 'no_gsc_properties' && (
        <div className="px-4 py-3 rounded-lg bg-status-error/10 border border-status-error/20">
          <p className="font-sans text-sm text-status-error">
            No Search Console properties found. Make sure the Google account you connect has at least one verified property in Search Console.
          </p>
        </div>
      )}

      <div className="p-6 rounded-xl bg-background-secondary border border-background-border space-y-5">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-background-tertiary border border-background-border-mid flex items-center justify-center">
            <Search size={16} strokeWidth={1.5} className="text-text-secondary" />
          </div>
          <div className="space-y-1">
            <p className="font-sans text-sm font-medium text-text-primary">
              Connect Google Search Console
            </p>
            <p className="font-sans text-sm text-text-secondary leading-relaxed">
              LYRA reads your top queries, click data, and page performance. You can then score any page and generate AI-optimised meta titles, descriptions, and headings.
            </p>
          </div>
        </div>

        <div className="space-y-2 pl-13">
          {[
            'The Google account must already have a verified property in Search Console.',
            'LYRA requests read-only access — it cannot make changes to your GSC account.',
            'GSC data has a 3-day lag — recent data may not appear immediately.',
          ].map((note) => (
            <p key={note} className="font-sans text-xs text-text-tertiary flex items-start gap-2">
              <span className="shrink-0 mt-0.5">–</span>
              {note}
            </p>
          ))}
        </div>

        <a
          href={`/api/seo/connect?workspaceId=${workspaceId}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
        >
          <Search size={14} strokeWidth={2} />
          Connect Search Console
        </a>
      </div>
    </div>
  )
}
