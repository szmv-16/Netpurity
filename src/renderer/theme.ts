export type ThemeMode = 'dark' | 'light' | 'system'

const KEY = 'netpurity.theme'

export function loadTheme(): ThemeMode {
  const saved = localStorage.getItem(KEY)
  return saved === 'light' || saved === 'system' || saved === 'dark' ? saved : 'dark'
}

export function applyTheme(mode: ThemeMode): void {
  const prefersLight =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
  const effective = mode === 'system' ? (prefersLight ? 'light' : 'dark') : mode
  document.documentElement.dataset.theme = effective
  localStorage.setItem(KEY, mode)
}
