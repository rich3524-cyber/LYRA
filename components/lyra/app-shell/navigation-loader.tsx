'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export function NavigationLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const pendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pendingRef.current) { pendingRef.current = false; setVisible(false) }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [pathname])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href]')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      const targetPath = href.split('?')[0]
      if (targetPath === window.location.pathname) return
      pendingRef.current = true
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) setVisible(true)
      }, 100)
    }
    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="nav-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background-primary"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
              <rect x="10" y="10" width="44" height="44" fill="none" stroke="#aaaaaa" strokeWidth="1.5" />
              <line x1="22" y1="20" x2="22" y2="44" stroke="#d8d8d8" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="22" y1="44" x2="42" y2="44" stroke="#d8d8d8" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
