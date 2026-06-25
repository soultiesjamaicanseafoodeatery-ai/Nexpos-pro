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
const QZ_CERT = `
-----BEGIN CERTIFICATE-----
MIIDCzCCAfOgAwIBAgIUKkhy+v9ycLXXMuctycMsuAmhxPowDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKTmV4UE9TIFBybzAeFw0yNjA2MjQwNTU1MDhaFw0zNjA2
MjEwNTU1MDhaMBUxEzARBgNVBAMMCk5leFBPUyBQcm8wggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQC6qrGVRRBfZZWqjkTMmtCENbtdVlCsHOhhxvwI/Czq
LkT/djSVaX+O48BGXxjL82cGsOshyHP+qrgLzE3JEa6eLmZ6iR6boShvVg7HFaDo
cpBgA6SQOv4rPUxLSR4EDMmtOTYt1NF0HfY8FBekeUnAyj1b3ArX5wPm11VNsCqz
g2Rvkk17fiS7hoJBCG0NWj3OFNAYU/fePVIA11O0NG2POThM+7QXLyCXXbqm7zzI
IM90BbQAL7FNu5aIbge11sopoZrziqkEDTLOZ5n7P6q2sEwnOaWayrG6uOE+gzOk
SQroCyA3cCnlklN3y9j/bzuUqQAe6AY26mprnvvhBc3DAgMBAAGjUzBRMB0GA1Ud
DgQWBBQ5BOH9zxuJOrltVavtelYgHZ7zbzAfBgNVHSMEGDAWgBQ5BOH9zxuJOrlt
VavtelYgHZ7zbzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCS
70QkMOWPeROHN/mTVY8Z6CQQSIoGgQx2HoFbfl55U6HJy71hhJJdfvmh0/Ws9v2m
64IxQFit20ToHXGerZy9IRoVfw6mceVh4g3JluuF5H+fPyqsVSRteL0Bl/TQaCu9
Fu+IN3nKIiqdBhDHRxRX7QYOu8zswWG2wd0NBP2IRrQsHo8ZBI6vpYOjnVhjXZPI
I/Ie1rS/dSIyncJGTX+vAxmpv2nxGesq3yWAsfhYi3/DvoSJRCQ43BO+pV2KLGKs
IG/rkHUeuzggzluMXH1y835cJfsQnroia//oTjFRlut4DjzuE1NrC838vXgA8xyK
Nc305DqZJUUA98K3NBlM
-----END CERTIFICATE-----
`

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
      await qz.websocket.connect({ retries: 3, delay: 1, keepAlive: 20 })
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
// ESC p <pin> 0x40 0xF0 -- tries both pin 2 and pin 5 (covers all drawer wiring types).
export async function qzOpenDrawer(printerName: string): Promise<boolean> {
  if (!printerName.trim()) return false
  try {
    const ok = await qzConnect()
    if (!ok) return false
    const qz = getQZ()
    if (!qz) return false

    const config = qz.configs.create(printerName)
    const cmd   = (pin: number) => [0x1B, 0x70, pin, 0x40, 0xF0]
    const b64   = btoa(String.fromCharCode(...cmd(0x00), ...cmd(0x01)))
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

// Send raw ESC/POS text to a printer.
// Encodes the entire payload (init + text + cut) as a single base64 block so QZ Tray
// sends exact bytes — flavor:'plain' can use the system charset and garble the output.
export async function qzPrintRaw(printerName: string, text: string): Promise<boolean> {
  if (!printerName.trim() || !text.trim()) return false
  try {
    const ok = await qzConnect()
    if (!ok) { dispatchPrintFailed('Printer offline -- check that QZ Tray is running'); return false }
    const qz = getQZ()
    if (!qz) { dispatchPrintFailed('Printer offline -- QZ Tray not detected'); return false }
    const config = qz.configs.create(printerName)

    // Build a single ESC/POS byte stream and base64-encode the whole thing
    const init     = [0x1B, 0x40]                                       // ESC @ — initialize
    const textBytes = Array.from(new TextEncoder().encode(text))         // UTF-8 (ASCII-safe)
    const feed     = [0x1B, 0x64, 0x05, 0x1D, 0x56, 0x41, 0x03]       // 5-line feed + full cut
    const allBytes = [...init, ...textBytes, ...feed]
    let binary = ''
    for (const b of allBytes) { binary += String.fromCharCode(b) }
    const b64 = btoa(binary)

    await qz.print(config, [
      { type: 'raw', format: 'command', flavor: 'base64', data: b64 },
    ])
    return true
  } catch (e) {
    console.error('[QZ Tray] Raw print failed:', e)
    dispatchPrintFailed(`Print error -- ${e instanceof Error ? e.message : 'unknown error'}`)
    return false
  }
}