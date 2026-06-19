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
  // Cert is stored as base64 in env to survive Next.js client-bundle baking
  const certB64 = process.env.NEXT_PUBLIC_QZ_CERT ?? ''
  const cert = certB64 ? atob(certB64) : ''

  qz.security.setCertificatePromise(resolve => resolve(cert))
  qz.security.setSignatureAlgorithm('SHA512')

  if (cert) {
    // Cert is configured — sign server-side so the private key never touches the browser
    qz.security.setSignaturePromise(async (toSign) => {
      const res = await fetch('/api/qz-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: toSign }),
      })
      if (!res.ok) throw new Error(`Sign API ${res.status}`)
      const json = await res.json()
      return json.signature as string
    })
  } else {
    // No cert — anonymous mode (QZ Tray will show Allow/Block popup)
    qz.security.setSignaturePromise((toSign, signing) => signing(toSign, null))
  }
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
      setupSecurity(qz)
      if (qz.websocket.isActive()) return true
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

// Send ESC/POS cash drawer kick command to the receipt printer.
// ESC p 0 25 250 — pulse on drawer port 0.
export async function qzOpenDrawer(printerName: string): Promise<boolean> {
  if (!printerName.trim()) return false
  try {
    const ok = await qzConnect()
    if (!ok) return false
    const qz = getQZ()
    if (!qz) return false

    const config = qz.configs.create(printerName)
    // Build base64-encoded ESC/POS drawer kick: 1B 70 00 19 FA
    const bytes = [0x1B, 0x70, 0x00, 0x19, 0xFA]
    const b64   = btoa(String.fromCharCode(...bytes))
    await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'base64', data: b64 }])
    return true
  } catch (e) {
    console.error('[QZ Tray] Drawer kick failed:', e)
    return false
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
        body{font-family:'Courier New',monospace;font-size:14px;width:${width}mm;padding-bottom:50mm}
        pre{white-space:pre-wrap;word-break:break-all;font-family:inherit;font-size:inherit}
      </style></head><body>${html}</body></html>`,
    }])
    return true
  } catch (e) {
    console.error('[QZ Tray] Print failed:', e)
    return false
  }
}
