import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark'
export type TimeFormat = '12h' | '24h'

interface PreferencesContextValue {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  timeFormat: TimeFormat
  setTimeFormat: (format: TimeFormat) => void
}

const THEME_KEY = 'nannager:theme'
const TIME_FORMAT_KEY = 'nannager:time-format'

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

function readTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readTimeFormat(): TimeFormat {
  return localStorage.getItem(TIME_FORMAT_KEY) === '24h' ? '24h' : '12h'
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(readTheme)
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(readTimeFormat)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#111827')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(TIME_FORMAT_KEY, timeFormat)
  }, [timeFormat])

  return (
    <PreferencesContext.Provider value={{ theme, setTheme, timeFormat, setTimeFormat }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}
