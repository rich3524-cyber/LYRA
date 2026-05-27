'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  messages: string[]
}

export function AnalysisOverlay({ messages }: Props) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % messages.length)
    }, 2500)
    return () => clearInterval(timer)
  }, [messages.length])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 bg-background-primary"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
          <rect x="10" y="10" width="44" height="44" fill="none" stroke="#aaaaaa" strokeWidth="1.5" />
          <line x1="22" y1="20" x2="22" y2="44" stroke="#d8d8d8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="22" y1="44" x2="42" y2="44" stroke="#d8d8d8" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="font-sans text-sm text-text-secondary"
        >
          {messages[index]}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  )
}
