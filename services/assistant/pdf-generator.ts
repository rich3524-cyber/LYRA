import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font, Image, pdf } from '@react-pdf/renderer'
import type { ReportData } from './report-types'

Font.register({
  family: 'DM Sans',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff',
      fontWeight: 500,
    },
  ],
})

Font.register({
  family: 'Geist Mono',
  src: 'https://cdn.jsdelivr.net/npm/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff',
})

const C = {
  bg: '#080808',
  bgSecondary: '#0f0f0f',
  bgBorder: '#222222',
  textPrimary: '#e2e2e2',
  textSecondary: '#888888',
  textTertiary: '#555555',
  platinum: '#d8d8d8',
  silver: '#aaaaaa',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    padding: 48,
    fontFamily: 'DM Sans',
    color: C.textPrimary,
  },
  coverPage: {
    backgroundColor: C.bg,
    padding: 48,
    fontFamily: 'DM Sans',
    color: C.textPrimary,
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 8,
  },
  clientLogo: {
    maxHeight: 40,
    maxWidth: 120,
    objectFit: 'contain',
  },
  lyraMark: {
    fontSize: 18,
    fontFamily: 'DM Sans',
    fontWeight: 400,
    color: C.silver,
    letterSpacing: 4,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
    marginVertical: 24,
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: 'DM Sans',
    fontWeight: 400,
    color: C.textPrimary,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: 4,
  },
  coverDate: {
    fontSize: 12,
    color: C.textTertiary,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: 500,
    color: C.textPrimary,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.bgBorder,
    borderRadius: 10,
    padding: 12,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Geist Mono',
    color: C.platinum,
  },
  narrative: {
    fontSize: 13,
    lineHeight: 1.6,
    color: C.textSecondary,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.bgBorder,
  },
  tableCell: {
    fontSize: 12,
    color: C.textSecondary,
    flex: 1,
  },
  tableCellMono: {
    fontSize: 12,
    fontFamily: 'Geist Mono',
    color: C.textPrimary,
    flex: 1,
  },
  monthCard: {
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.bgBorder,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: C.textPrimary,
    marginBottom: 10,
  },
  pillarsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  pillarTag: {
    backgroundColor: C.bgBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    color: C.textSecondary,
  },
  keyDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  keyDateName: {
    fontSize: 11,
    fontWeight: 500,
    color: C.textPrimary,
    width: 120,
  },
  keyDateIdea: {
    fontSize: 11,
    color: C.textSecondary,
    flex: 1,
  },
  subHeading: {
    fontSize: 10,
    fontWeight: 500,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
  },
})

interface CoverPageProps {
  workspaceName: string
  quarter: string
  clientLogoUrl: string | null
  generatedDate: string
}

function CoverPageComponent({ workspaceName, quarter, clientLogoUrl, generatedDate }: CoverPageProps) {
  return React.createElement(
    Page,
    { size: 'A4', style: styles.coverPage },
    React.createElement(
      View,
      null,
      React.createElement(
        View,
        { style: styles.logoRow },
        clientLogoUrl
          ? React.createElement(Image, { src: clientLogoUrl, style: styles.clientLogo })
          : null,
        React.createElement(Text, { style: styles.lyraMark }, 'LYRA')
      ),
      React.createElement(View, { style: styles.divider }),
      React.createElement(Text, { style: styles.coverTitle }, 'LYRA Assistant'),
      React.createElement(Text, { style: styles.coverSubtitle }, workspaceName),
      React.createElement(Text, { style: styles.coverSubtitle }, quarter + ' Report'),
    ),
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: styles.coverDate }, 'Generated ' + generatedDate)
    )
  )
}

interface PerformancePageProps {
  report: ReportData
}

function PerformancePageComponent({ report }: PerformancePageProps) {
  const { performance, period } = report
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Quarterly Review'),
    React.createElement(Text, { style: { ...styles.coverDate, marginBottom: 16 } }, period.label),
    React.createElement(
      View,
      { style: styles.statRow },
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Total Posts'),
        React.createElement(Text, { style: styles.statValue }, String(performance.totalPosts))
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Avg Engagement'),
        React.createElement(Text, { style: styles.statValue }, (performance.avgEngagementRate * 100).toFixed(1) + '%')
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Best Platform'),
        React.createElement(Text, { style: styles.statValue }, performance.bestPlatform ?? '—')
      ),
      React.createElement(
        View,
        { style: styles.statCard },
        React.createElement(Text, { style: styles.statLabel }, 'Top Theme'),
        React.createElement(Text, { style: { ...styles.statValue, fontSize: 12 } }, performance.topContentTheme ?? '—')
      )
    ),
    React.createElement(Text, { style: styles.narrative }, performance.insightNarrative),
    React.createElement(
      View,
      { style: styles.tableHeader },
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Platform'),
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Posts'),
      React.createElement(Text, { style: styles.tableHeaderCell }, 'Avg Engagement')
    ),
    ...performance.byPlatform.map(p =>
      React.createElement(
        View,
        { key: p.platform, style: styles.tableRow },
        React.createElement(Text, { style: styles.tableCell }, p.platform),
        React.createElement(Text, { style: styles.tableCellMono }, String(p.postCount)),
        React.createElement(Text, { style: styles.tableCellMono }, (p.avgEngagementRate * 100).toFixed(1) + '%')
      )
    )
  )
}

interface StrategyPageProps {
  report: ReportData
}

function StrategyPageComponent({ report }: StrategyPageProps) {
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Next 3 Months Strategy'),
    ...report.strategy.months.map((month, i) =>
      React.createElement(
        View,
        { key: String(i), style: styles.monthCard },
        React.createElement(Text, { style: styles.monthLabel }, month.month),
        month.contentPillars.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Content Pillars'),
              React.createElement(
                View,
                { style: styles.pillarsRow },
                ...month.contentPillars.map((p, j) =>
                  React.createElement(Text, { key: String(j), style: styles.pillarTag }, p)
                )
              )
            )
          : null,
        month.keyDates.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Key Dates'),
              ...month.keyDates.map((d, j) =>
                React.createElement(
                  View,
                  { key: String(j), style: styles.keyDateRow },
                  React.createElement(Text, { style: styles.keyDateName }, d.name),
                  React.createElement(Text, { style: styles.keyDateIdea }, d.campaignIdea)
                )
              )
            )
          : null,
        month.recommendedFrequency.length > 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, { style: styles.subHeading }, 'Post Frequency'),
              ...month.recommendedFrequency.map((f, j) =>
                React.createElement(
                  View,
                  { key: String(j), style: styles.tableRow },
                  React.createElement(Text, { style: styles.tableCell }, f.platform),
                  React.createElement(Text, { style: styles.tableCellMono }, f.postsPerWeek + '×/week')
                )
              )
            )
          : null
      )
    )
  )
}

export async function generatePDF(
  report: ReportData,
  workspaceName: string,
  quarter: string,
  clientLogoUrl: string | null
): Promise<Buffer> {
  const generatedDate = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const doc = React.createElement(
    Document,
    null,
    React.createElement(CoverPageComponent, { workspaceName, quarter, clientLogoUrl, generatedDate }),
    React.createElement(PerformancePageComponent, { report }),
    React.createElement(StrategyPageComponent, { report })
  )

  const blob = await pdf(doc).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
