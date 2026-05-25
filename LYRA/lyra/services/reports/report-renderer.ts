import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

export type ReportData = {
  workspaceName: string
  period: '7d' | '30d'
  generatedAt: string
  summary: {
    totalPosts: number
    totalImpressions: number
    totalEngagements: number
    avgEngRate: number
    bestPlatform: string
  }
  platforms: { platform: string; posts: number; impressions: number; engagements: number; engRate: number }[]
  topPosts: { platform: string; scheduledAt: string; contentExcerpt: string; impressions: number; engagements: number }[]
  narrative: string
}

const styles = StyleSheet.create({
  cover: {
    backgroundColor: '#080808',
    padding: 60,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  },
  page: {
    backgroundColor: '#0f0f0f',
    padding: 48,
    fontFamily: 'Helvetica',
  },
  coverTitle: {
    fontSize: 36,
    color: '#d8d8d8',
    fontFamily: 'Helvetica',
    marginBottom: 8,
  },
  coverSub: {
    fontSize: 14,
    color: '#888888',
    fontFamily: 'Helvetica',
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 16,
    color: '#d8d8d8',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 16,
    marginTop: 24,
  },
  label: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 24,
    color: '#e2e2e2',
    fontFamily: 'Courier',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingVertical: 8,
  },
  cell: {
    flex: 1,
    fontSize: 11,
    color: '#e2e2e2',
    fontFamily: 'Helvetica',
  },
  cellHeader: {
    flex: 1,
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
  },
  narrative: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'Helvetica',
    lineHeight: 1.7,
  },
  postCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  postMeta: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Helvetica',
    marginBottom: 4,
  },
  postExcerpt: {
    fontSize: 12,
    color: '#e2e2e2',
    fontFamily: 'Helvetica',
    marginBottom: 6,
  },
  postMetrics: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'Courier',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  summaryItem: {
    width: '45%',
  },
})

function CoverPage({ data }: { data: ReportData }) {
  const periodLabel = data.period === '7d' ? 'Last 7 days' : 'Last 30 days'
  return React.createElement(
    Page,
    { size: 'A4', style: styles.cover },
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: styles.coverTitle }, 'LYRA'),
      React.createElement(Text, { style: styles.coverSub }, data.workspaceName),
      React.createElement(Text, { style: styles.coverSub }, periodLabel),
      React.createElement(Text, { style: styles.coverSub }, `Generated ${data.generatedAt}`)
    )
  )
}

function ContentPage({ data }: { data: ReportData }) {
  const summaryItems = [
    { label: 'Posts published', value: data.summary.totalPosts.toString() },
    { label: 'Total impressions', value: data.summary.totalImpressions.toLocaleString() },
    { label: 'Total engagements', value: data.summary.totalEngagements.toLocaleString() },
    { label: 'Avg. engagement rate', value: `${data.summary.avgEngRate.toFixed(2)}%` },
  ]

  const headerCells = ['Platform', 'Posts', 'Impressions', 'Engagements', 'Eng. Rate'].map((h) =>
    React.createElement(Text, { key: h, style: styles.cellHeader }, h)
  )

  const platformRows = data.platforms.map((p) =>
    React.createElement(
      View,
      { key: p.platform, style: styles.row },
      React.createElement(Text, { style: styles.cell }, p.platform),
      React.createElement(Text, { style: styles.cell }, p.posts.toString()),
      React.createElement(Text, { style: styles.cell }, p.impressions.toLocaleString()),
      React.createElement(Text, { style: styles.cell }, p.engagements.toLocaleString()),
      React.createElement(Text, { style: styles.cell }, `${p.engRate.toFixed(2)}%`)
    )
  )

  const topPostCards = data.topPosts.map((post, i) =>
    React.createElement(
      View,
      { key: i, style: styles.postCard },
      React.createElement(Text, { style: styles.postMeta }, `${post.platform} · ${post.scheduledAt}`),
      React.createElement(Text, { style: styles.postExcerpt }, post.contentExcerpt),
      React.createElement(
        Text,
        { style: styles.postMetrics },
        `${post.impressions.toLocaleString()} impressions · ${post.engagements.toLocaleString()} engagements`
      )
    )
  )

  const platformSection =
    data.platforms.length > 0
      ? [
          React.createElement(Text, { key: 'ph', style: styles.sectionHeading }, 'Platform Breakdown'),
          React.createElement(View, { key: 'phead', style: styles.row }, ...headerCells),
          ...platformRows,
        ]
      : []

  const topPostsSection =
    data.topPosts.length > 0
      ? [
          React.createElement(Text, { key: 'tph', style: styles.sectionHeading }, 'Top Posts'),
          ...topPostCards,
        ]
      : []

  const narrativeSection =
    data.narrative.length > 0
      ? [
          React.createElement(Text, { key: 'nh', style: styles.sectionHeading }, 'Performance Analysis'),
          React.createElement(Text, { key: 'nb', style: styles.narrative }, data.narrative),
        ]
      : []

  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Executive Summary'),
    React.createElement(
      View,
      { style: styles.summaryGrid },
      ...summaryItems.map((item) =>
        React.createElement(
          View,
          { key: item.label, style: styles.summaryItem },
          React.createElement(Text, { style: styles.label }, item.label),
          React.createElement(Text, { style: styles.value }, item.value)
        )
      )
    ),
    React.createElement(Text, { style: styles.label }, 'Best platform'),
    React.createElement(
      Text,
      { style: { fontSize: 14, color: '#e2e2e2', fontFamily: 'Helvetica', marginBottom: 24 } },
      data.summary.bestPlatform
    ),
    ...platformSection,
    ...topPostsSection,
    ...narrativeSection
  )
}

export async function renderReport(data: ReportData): Promise<Buffer> {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(CoverPage, { data }),
    React.createElement(ContentPage, { data })
  )
  return renderToBuffer(doc)
}
