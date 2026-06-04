import { Play } from 'lucide-react'

export default function VideoPlaceholder() {
  return (
    <div className="w-full max-w-3xl mx-auto mt-12 rounded-xl border border-background-border bg-background-secondary aspect-video flex flex-col items-center justify-center gap-3">
      <div className="w-14 h-14 rounded-full border border-background-border bg-background-tertiary flex items-center justify-center">
        <Play size={20} strokeWidth={1.5} className="text-text-tertiary ml-0.5" />
      </div>
      <p className="font-sans text-sm text-text-tertiary">Watch demo coming soon</p>
    </div>
  )
}
