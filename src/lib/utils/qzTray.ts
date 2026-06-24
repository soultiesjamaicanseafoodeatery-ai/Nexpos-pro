// QZ Tray integration -- enables direct printing to named USB/network printers
// from the browser without an OS print dialog.
//
// Requirements:
//   1. Install QZ Tray (free) from https://qz.io
//   2. Launch QZ Tray -- it runs in the system tray
//   3. In QZ Tray -> Preferences -> Site Manager, add this site to trusted sites
//   4. Configure printer names in Settings -> Printers

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

function dispatchPrintFailed(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('print-failed', { detail: { message } }))
  console.error('[QZ]', message)
}

async function loadScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (window.qz) return true
  if (scriptLoaded)  return !!window.qz

  // Try locally bundled /public/qz-tray.js first so printing works without internet.
  // Falls back to CDN if the local copy is not present.
  return new Promise(resolve => {
    const script = document.createElement('script')
    script.src = '/qz-tray.js'
    script.onload = () => { scriptLoaded = true; resolve(!!window.qz) }
    script.onerror = () => {
      const cdn = document.createElement('script')
      cdn.src = 'https://cdn.jsdelivr.net/npm/qz-tray/qz-tray.js'
      cdn.onload  = () => { scriptLoaded = true; resolve(!!window.qz) }
      cdn.onerror = () => resolve(false)
      document.head.appendChild(cdn)
    }
    document.head.appendChild(script)
  })
}

// Public certificate -- safe to embed in source. Private key lives server-side in QZ_PRIVATE_KEY.
const QZ_CERT = `-----BEGIN CERTIFICATE-----
MIIDCzCCAfOgAwIBAgIUGVTRWimP+oBMK81fXOEA/O18ARgwDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKTmV4UE9TIFBybzAeFw0yNjA2MTkwMzQzNDVaFw0zNjA2
MTYwMzQzNDVaMBUxEzARBgNVBAMMCk5leFBPUyBQcm8wggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQCsBYt/c/GF73LmmPZubaWMEL1WoFwNjwFpr8PLfIhQ
VBw+6nPPe4kZDtzNuFQ6geT9iK/zNLXabEbU7zgGcmQddEhsr26XgJKKsBW2O0Nr
ue0iKNZcIS+UtWYKnzVE6kmA1XW2daxX4obf/n8tCavCbf2jCwdB3gcucGpbrQXk
/ihPZMBYy9NRNLJQYrRghytKhRBOqnqUzmTy1MlUXlc3hb6An4QdSMJ0ordiZAwm
nIPe9OZFMSbFsWj+7OVBYM5fAxZPNDsaBlsCF5r3+AB43hDxCZ9BXFZKfjiumvEV
C5yJgFNZwVLyS0GXB9KDyP/K6NrlyS74Y05DQYaiIUJrAgMBAAGjUzBRMB0GA1Ud
DgQWBBRwB9tdEezIQMDVyHd3r4V76B1TojAfBgNVHSMEGDAWgBRwB9tdEezIQMDV
yHd3r4V76B1TojAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCK
xj4e2+OFqYNNfaowtCUtBkJKNi7ctGP1Vi+axh5ag9D4eceLqtfGiqrwyBzrWDFH
voO2n/TOP5zU89BI813mB6MSf0GaJ6Pfoxe06AX4ND5HfAUP/KyluOdG5z1FwgO4
jldUxUqELHF4A6WuV/AZnY3g4I7+DABauinPD6YqECdvLIsyOoFyc2hNGKmO8Ysj
pADPkATKF6N1VKW2xz/Xzp+ggwwRv6z8rsqiaYjUOFj6VnjgRes95qC806+eizL/
poeiY89g7zq2nwcXnK1+ktPiZeJ3nRzc+oEq2V7oR/aENQr7eRSi4HeJbRmUKPrZ
SMBP4nVqZUtlUIC8k+5L
-----END CERTIFICATE-----`

function setupSecurity(qz: QZTrayAPI) {
  qz.security.setCertificatePromise(resolve => resolve(QZ_CERT))
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise(async (toSign) => {
    const res = await fetch('/api/qz-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: toSign }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Sign API ${res.status}: ${body}`)
    }
    const json = await res.json()
    if (!json.signature) throw new Error(`Sign API no signature: ${JSON.stringify(json)}`)
    return json.signature as string
  })
}

// Connect to QZ Tray -- returns true if connected, false if unavailable
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
      await qz.websocket.connect({ retries: 3, delay: 1 })
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

// List all printers visible to QZ Tray -- useful for the settings UI
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
// ESC p 0 25 250 -- pulse on drawer port 0.
export async function qzOpenDrawer(printerName: string): Promise<boolean> {
  if (!printerName.trim()) return false
  try {
    const ok = await qzConnect()
    if (!ok) return false
    const qz = getQZ()
    if (!qz) return false

    const config = qz.configs.create(printerName)
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
    if (!ok) {
      dispatchPrintFailed('Printer offline -- check that QZ Tray is running')
      return false
    }
    const qz = getQZ()
    if (!qz) {
      dispatchPrintFailed('Printer offline -- QZ Tray not detected')
      return false
    }

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
    dispatchPrintFailed(`Print error -- ${e instanceof Error ? e.message : 'unknown error'}`)
    return false
  }
}