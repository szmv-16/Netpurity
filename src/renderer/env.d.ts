import type { NetPurityApi } from '../../electron/preload.ts'

declare global {
  interface Window {
    netpurity: NetPurityApi
  }
}

export {}
