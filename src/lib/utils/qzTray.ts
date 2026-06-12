// QZ Tray integration — enables direct printing to named USB/network printers
// from the browser without an OS print dialog.
//
// Requirements:
//   1. Install QZ Tray (free) from https://qz.io
//   2. Launch QZ Tray — it runs in the system tray
//   3. In QZ Tray → Preferences → Site Manager, add this site to trusted sites
//   4. Configure printer names in Settings → Printers

interface QZConfig { name: string }
interface QZPrintData { type: string; format: string; flavor: string; data: string }

interface QZTrayAPI {
  websocket: {
    connect:    (opts?: object)  => Promise<void>
    disconnect: ()               => Promise<void>
    isActive:   ()               => boolean
  }
  security: {
    setCertificatePromise: (fn: (resolve: (cert: string) => void) => void) => void
    setSignatureAlgorithm:  (alg: string) => void
    setSignaturePromise:    (fn: (toSign: string, signing: (d: string, pk: null) => Promise<string>) => Promise<string>) => void
  }
  configs: { create: (printer: string, opts?: object) => QZConfig }
  printers: { find: (query?: string) => Promise<string | string[]> }
  print:    (config: QZConfig, data: QZPrintData[]) => Promise<void>
}

declare global {
  interface Window { qz?: QZTrayAPI }
}

let scriptLoaded = false
let connectPromise: Promise<boolean> | null = null

function getQZ(): QZTrayAPI | null {
  return typeof window !== 'undefined' ? (window.qz ?? null) : null
}

async function loadScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.qz) return true
  if (scriptLoaded)  return !!window.qz

  return new Promise(resolve => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray/qz-tray.js'
    script.onload  = () => { scriptLoaded = true; resolve(!!window.qz) }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

function setupSecurity(qz: QZTrayAPI) {
  qz.security.setCertificatePromise(resolve => resolve(''))
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise((toSign, signing) => signing(toSign, null))
}

// Connect to QZ Tray — returns true if connected, false if unavailable
export async function qzConnect(): Promise<boolean> {
  if (connectPromise) return connectPromise

  connectPromise = (async () => {
    try {
      const ok = await loadScript()
      if (!ok) return false
      const qz = getQZ()
      if (!qz) return false
      if (qz.websocket.isActive()) return true
      setupSecurity(qz)
      await qz.websocket.connect({ retries: 1, delay: 0.3 })
      return true
    } catch {
      return false
    } finally {
      connectPromise = null
    }
  })()

  return connectPromise
}

export function qzIsConnected(): boolean {
  return getQZ()?.websocket.isActive() ?? false
}

// List all printers visible to QZ Tray — useful for the settings UI
export async function qzGetPrinters(): Promise<string[]> {
  try {
    const ok = await qzConnect()
    if (!ok) return []
    const qz = getQZ()
    if (!qz) return []
    const result = await qz.printers.find()
    return Array.isArray(result) ? result : [result]
  } catch {
    return []
  }
}

// Print HTML to a named printer via QZ Tray.
// Returns true if printed successfully, false if QZ is unavailable (caller should fall back).
export async function qzPrint(printerName: string, html: string, width: 58 | 80 = 80): Promise<boolean> {
  if (!printerName.trim() || !html.trim()) return false
  try {
    const ok = await qzConnect()
    if (!ok) return false
    const qz = getQZ()
    if (!qz) return false

    const config = qz.configs.create(printerName, {
      size: { width: `${width}mm`, units: 'mm' },
      margins: { top: 2, right: 2, bottom: 2, left: 2, units: 'mm' },
    } as any)

    await qz.print(config, [{
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: `<!DOCTYPE html><html><head><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Courier New',monospace;font-size:11px;width:${width}mm}
        pre{white-space:pre-wrap;word-break:break-all;font-family:inherit;font-size:inherit}
      </style></head><body>${html}</body></html>`,
    }])
    return true
  } catch {
    return false
  }
}
