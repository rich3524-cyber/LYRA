'use client'
import { useState, useEffect } from 'react'
import { CommentCard } from './comment-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

interface CommentData {
  id:              string
  authorName:      string
  authorHandle?:   string | null
  content:         string
  sentiment?:      string | null
  status:          string
  aiDraftResponse: string | null
  createdAt:       string
  socialAccount:   { platform: string; name: string }
}

export function ResponseInbox({ workspaceId }: { workspaceId: string }) {
  const [comments, setComments] = useState<CommentData[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch(`/api/comments?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then((data: CommentData[]) => { setComments(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspaceId])

  const pending   = comments.filter(c => c.status === 'PENDING' || c.status === 'AI_DRAFTED')
  const escalated = comments.filter(c => c.status === 'ESCALATED')
  const responded = comments.filter(c => c.status === 'RESPONDED')

  function handleUpdate(id: string, nextStatus: string) {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: nextStatus } : c))
  }

  return (
    <Tabs defaultValue="pending" className="space-y-4">
      <TabsList className="bg-[#111] border border-[#222]">
        <TabsTrigger value="pending" className="text-xs gap-2">
          Pending
          {pending.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-[#1a1a1a]">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="escalated" className="text-xs gap-2">
          Escalated
          {escalated.length > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-500/20 text-amber-400">
              {escalated.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="responded" className="text-xs">Done</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[#111] border border-[#222] animate-pulse" />
          ))
        ) : pending.length === 0 ? (
          <p className="text-sm text-[#555] text-center py-12">All caught up ✓</p>
        ) : (
          pending.map(c => (
            <CommentCard
              key={c.id}
              comment={c}
              onUpdate={() => handleUpdate(c.id, 'RESPONDED')}
            />
          ))
        )}
      </TabsContent>

      <TabsContent value="escalated" className="space-y-3">
        {escalated.length === 0 ? (
          <p className="text-sm text-[#555] text-center py-12">No escalated comments</p>
        ) : (
          escalated.map(c => (
            <CommentCard key={c.id} comment={c} onUpdate={() => {}} />
          ))
        )}
      </TabsContent>

      <TabsContent value="responded" className="space-y-3">
        {responded.length === 0 ? (
          <p className="text-sm text-[#555] text-center py-12">No responses sent yet</p>
        ) : (
          responded.map(c => (
            <CommentCard key={c.id} comment={c} onUpdate={() => {}} />
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}
