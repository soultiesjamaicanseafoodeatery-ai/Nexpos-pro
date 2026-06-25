'use client'
import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { supabase } from '@/lib/supabase'
import type { BusinessConfig } from '@/types'

type Tab = 'business' | 'tax' | 'receipt' | 'modules' | 'printers'

const TABS: { id: Tab; label: string }[] = [
  { id: 'business', label: 'Business Info' },
  { id: 'tax',      label: 'Tax & Fees' },
  { id: 'receipt',  label: 'Receipt' },
  { id: 'modules',  label: 'Modules' },
  { id: 'printers', label: 'Printers' },
]

export default function SettingsPage() {
  const { state, dispatch, toast } = useApp()
  const [tab, setTab]     = useState<Tab>('business')
  const [form, setForm]   = useState<BusinessConfig>(() => ({ ...state.biz }))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty]   = useState(false)

  const set = (patch: Partial<BusinessConfig>) => {
    setForm(f => ({ ...f, ...patch }))
    setDirty(true)
  }
  const setFooter = (patch: Partial<BusinessConfig['footer']>) => {
    setForm(f => ({ ...f, footer: { ...f.footer, ...patch } }))
    setDirty(true)
  }
  const setSocial = (patch: Partial<BusinessConfig['footer']['social']>) => {
    setForm(f => ({ ...f, footer: { ...f.footer, social: { ...f.footer.social, ...patch } } }))
    setDirty(true)
  }
  const setMod = (mod: keyof BusinessConfig['modules'], patch: Record<string, string>) => {
    setForm(f => ({ ...f, modules: { ...f.modules, [mod]: { ...f.modules[mod], ...patch } } }))
    setDirty(true)
  }
  const setTaxCfg = (mod: 'restaurant' | 'bar' | 'carwash', patch: Record<string, unknown>) => {
    setForm(f => {
      const seed = (f as BusinessConfig & { taxConfig?: Record<string, Record<string, unknown>> }).taxConfig ?? {}
      return { ...f, taxConfig: { ...seed, [mod]: { ...(seed[mod] ?? {}), ...patch } } }
    })
    setDirty(true)
  }
  const setPrinters = (patch: Partial<NonNullable<BusinessConfig['printers']>>) => {
    setForm(f => ({ ...f, printers: { receipt: '', kitchen: '', bar: '', width: 80, autoPrint: false, receiptPreview: false, drawerEnabled: false, ...f.printers, ...patch } }))
    setDirty(true)
  }

  const testDrawer = async () => {
    if (!form.printers?.receipt?.trim()) { setPrinterError('Set a Receipt Printer name first — the cash drawer is wired through it.'); return }
    if (qzStatus !== 'connected') { setPrinterError('QZ Tray not connected — start QZ Tray first.'); return }
    const { qzOpenDrawer } = await import('@/lib/utils/qzTray')
    const ok = await qzOpenDrawer(form.printers.receipt.trim())
    if (!ok) setPrinterError('Drawer kick failed — check that QZ Tray is running and the receipt printer name is correct.')
    else setPrinterError('')
  }

  // QZ Tray state
  const [qzStatus, setQZStatus]     = useState<'idle' | 'checking' | 'connected' | 'off'>('idle')
  const [qzPrinters, setQZPrinters] = useState<string[]>([])
  const [fetchingPrinters, setFetchingPrinters] = useState(false)
  const [printerError, setPrinterError] = useState('')

  const checkQZ = useCallback(async () => {
    setQZStatus('checking')
    try {
      const { qzConnect, qzGetPrinters } = await import('@/lib/utils/qzTray')
      const ok = await qzConnect()
      if (ok) {
        setQZStatus('connected')
        setQZPrinters(await qzGetPrinters())
      } else {
        setQZStatus('off')
      }
    } catch {
      setQZStatus('off')
    }
  }, [])

  const fetchPrinters = useCallback(async () => {
    setFetchingPrinters(true)
    setPrinterError('')
    try {
      const { qzConnect, qzGetPrinters } = await import('@/lib/utils/qzTray')
      const connected = await qzConnect()
      if (!connected) {
        setPrinterError('QZ Tray not connected. Make sure it is running and this site is trusted.')
        setQZStatus('off')
        return
      }
      setQZStatus('connected')
      const list = await qzGetPrinters()
      if (list.length === 0) {
        setPrinterError('No printers found. Make sure printers are installed in Windows Settings → Printers & scanners.')
      } else {
        setQZPrinters(list)
        setPrinterError('')
      }
    } catch (e) {
      setPrinterError('Error detecting printers: ' + String(e))
    } finally {
      setFetchingPrinters(false)
    }
  }, [])

  useEffect(() => { if (tab === 'printers') checkQZ() }, [tab, checkQZ])

  const testPrint = async (label: string, content: string, printerName?: string, printWidth?: 58 | 80) => {
    const w = printWidth ?? (form.printers?.width ?? 80) as 58 | 80
    if (!printerName?.trim()) {
      setPrinterError('No printer name set — type the printer name in the field above first.')
      return
    }
    if (qzStatus === 'connected') {
      setPrinterError('')
      if (w === 58) {
        const { qzPrintRaw } = await import('@/lib/utils/qzTray')
        const ok = await qzPrintRaw(printerName.trim(), content)
        if (!ok) setPrinterError('Kitchen printer (POS-58) not responding. Check QZ Tray is running and the printer name matches exactly.')
        return
      }
      const { qzPrint } = await import('@/lib/utils/qzTray')
      const ok = await qzPrint(printerName.trim(), `<pre>${content}</pre>`, w)
      if (ok) return
      setPrinterError(`QZ Tray could not send to "${printerName.trim()}". Check Console (F12) for the exact error — common causes: wrong printer name, or certificate not yet trusted in QZ Tray Advanced.`)
    }
    // Fallback: browser print dialog (only for 80mm receipt/bar)
    const win = window.open(', '_blank', 'width=440,height=600,menubar=no,toolbar=no')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${label}</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:11px;padding:8px;background:#fff;color:#000}
      pre{white-space:pre-wrap;word-break:break-all;font-family:inherit}
      @media print{@page{margin:2mm;size:${w}mm auto}body{width:${w}mm}}
    </style></head><body><pre>${content}</pre>
    <script>window.onload=()=>{setTimeout(()=>{window.print();setTimeout(()=>window.close(),600)},100)}<\/script>
    </body></html>`)
    win.document.close()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      dispatch({ type: 'SET_BIZ', biz: form })
      if (supabase) {
        await supabase.from('business_config').upsert({ id: 'main', data: form, updated_at: new Date().toISOString() })
      }
      setDirty(false)
    } catch {
      toast('Failed to sync to cloud — saved locally', 'warn')
    } finally {
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }
  const inp: React.CSSProperties = { background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 'var(--r2)', padding: '8px 10px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
  const section: React.CSSProperties = { background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: '18px 20px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, color: 'var(--txt)', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--bdr)' }

  const taxCfg = (form as BusinessConfig & { taxConfig?: Record<string, Record<string, unknown>> }).taxConfig ?? {}

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1, maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Settings</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>Business configuration and preferences</div>
        </div>
        <button onClick={handleSave} disabled={saving || !dirty} style={{
          padding: '9px 22px', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, cursor: dirty ? 'pointer' : 'not-allowed',
          background: dirty ? 'var(--blue)' : 'var(--surf3)', color: dirty ? '#fff' : 'var(--txt3)', border: 'none',
        }}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--bdr)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--blue)' : 'transparent'}`,
            color: tab === t.id ? 'var(--blue)' : 'var(--txt3)', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Business Info ── */}
      {tab === 'business' && (
        <>
          <div style={section}>
            <div style={sectionTitle}>Business Details</div>
            <div style={{ ...grid2, marginBottom: 14 }}>
              <div><label style={lbl}>Business Name</label><input style={inp} value={form.name} onChange={e => set({ name: e.target.value })} /></div>
              <div><label style={lbl}>Tagline</label><input style={inp} value={form.tagline} onChange={e => set({ tagline: e.target.value })} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Address</label>
              <input style={inp} value={form.address} onChange={e => set({ address: e.target.value })} />
            </div>
            <div style={{ ...grid2, marginBottom: 14 }}>
              <div><label style={lbl}>Phone</label><input style={inp} value={form.phone} onChange={e => set({ phone: e.target.value })} /></div>
              <div><label style={lbl}>Email</label><input style={inp} value={form.email} onChange={e => set({ email: e.target.value })} type="email" /></div>
            </div>
            <div style={{ ...grid2 }}>
              <div><label style={lbl}>Website</label><input style={inp} value={form.website} onChange={e => set({ website: e.target.value })} /></div>
              <div><label style={lbl}>Currency Symbol</label><input style={inp} value={form.currencySymbol} onChange={e => set({ currencySymbol: e.target.value })} /></div>
            </div>
          </div>
          {/* GCT/TRN compliance warning */}
          {((!form.gctRegNo || form.gctRegNo.trim() === "" || form.gctRegNo.includes("000")) || (!form.trn || form.trn.trim() === "" || form.trn.includes("000"))) && (
            <div style={{ background: "#fef2f2", border: "2px solid #ef4444", borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 4, fontSize: 13 }}>Tax Information Incomplete — Receipts Are Non-Compliant</div>
                <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                  Your GCT Registration Number and/or TRN appear to contain placeholder values. These print on every customer receipt. Update them before processing real transactions.
                </div>
              </div>
            </div>
          )}
          <div style={section}>
            <div style={sectionTitle}>Tax Registration</div>
            <div style={grid2}>
              <div><label style={lbl}>GCT Registration No.</label><input style={inp} value={form.gctRegNo} onChange={e => set({ gctRegNo: e.target.value })} /></div>
              <div><label style={lbl}>TRN</label><input style={inp} value={form.trn} onChange={e => set({ trn: e.target.value })} /></div>
            </div>
          </div>
          <div style={section}>
            <div style={sectionTitle}>Social Media</div>
            <div style={grid2}>
              <div><label style={lbl}>Instagram</label><input style={inp} value={form.footer.social.instagram} onChange={e => setSocial({ instagram: e.target.value })} /></div>
              <div><label style={lbl}>Facebook</label><input style={inp} value={form.footer.social.facebook} onChange={e => setSocial({ facebook: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={lbl}>WhatsApp</label>
              <input style={inp} value={form.footer.social.whatsapp} onChange={e => setSocial({ whatsapp: e.target.value })} />
            </div>
          </div>
        </>
      )}



          <div style={section}>
            <div style={sectionTitle}>Security</div>
            <div>
              <label style={lbl}>Auto Logout</label>
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>
                Automatically log out staff after inactivity. A 60-second warning appears before logout.
              </div>
              <select
                style={{ ...inp, width: 240 }}
                value={String(form.autoLogoutMinutes ?? 30)}
                onChange={e => set({ autoLogoutMinutes: Number(e.target.value) })}
              >
                <option value="0">Disabled</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes (Recommended)</option>
                <option value="60">60 Minutes</option>
              </select>
            </div>
          </div>
      {/* ` Tax & Fees ── */}
      {tab === 'tax' && (
        <>
          {(['restaurant','bar','carwash'] as const).map(m => {
            const cfg = taxCfg[m] ?? {}
            const rate  = Number(cfg.rate  ?? (m === 'restaurant' ? 0.15 : m === 'bar' ? 0.10 : 0.08))
            const scRate = Number(cfg.serviceChargeRate ?? 0.10)
            const gctEnabled = cfg.enabled !== false
            const scEnabled  = cfg.serviceChargeEnabled === true
            return (
              <div key={m} style={section}>
                <div style={sectionTitle}>{m.charAt(0).toUpperCase() + m.slice(1)}</div>
                <div style={grid2}>
                  <div>
                    <label style={lbl}>GCT Rate (%)</label>
                    <input type="number" step="0.5" min={0} max={50} style={inp}
                      value={(rate * 100).toFixed(1)}
                      onChange={e => setTaxCfg(m, { rate: Number(e.target.value) / 100 })} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)' }}>
                      <input type="checkbox" checked={gctEnabled} onChange={e => setTaxCfg(m, { enabled: e.target.checked })} />
                      GCT Enabled
                    </label>
                  </div>
                </div>
                {m === 'restaurant' && (
                  <div style={{ ...grid2, marginTop: 14 }}>
                    <div>
                      <label style={lbl}>Service Charge (%)</label>
                      <input type="number" step="0.5" min={0} max={30} style={inp}
                        value={(scRate * 100).toFixed(1)}
                        onChange={e => setTaxCfg(m, { serviceChargeRate: Number(e.target.value) / 100 })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)' }}>
                        <input type="checkbox" checked={scEnabled} onChange={e => setTaxCfg(m, { serviceChargeEnabled: e.target.checked })} />
                        Service Charge Enabled
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── Receipt ── */}
      {tab === 'receipt' && (
        <>
          <div style={section}>
            <div style={sectionTitle}>Receipt Settings</div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Receipt Width (px)</label>
              <input type="number" style={inp} value={form.receiptWidth} onChange={e => set({ receiptWidth: Number(e.target.value) })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Footer Message</label>
              <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} value={form.footer.message}
                onChange={e => setFooter({ message: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Refund Policy</label>
              <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' as const }} value={form.footer.refundPolicy}
                onChange={e => setFooter({ refundPolicy: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>QR Scan Prompt</label>
              <input style={inp} value={form.footer.qrText} onChange={e => setFooter({ qrText: e.target.value })} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)' }}>
              <input type="checkbox" checked={form.footer.qrEnabled} onChange={e => setFooter({ qrEnabled: e.target.checked })} />
              Show QR code on receipts
            </label>
          </div>
        </>
      )}

      {/* ── Printers ── */}
      {tab === 'printers' && (
        <>
          {/* QZ Tray status */}
          <div style={section}>
            <div style={sectionTitle}>QZ Tray Connection</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: qzStatus === 'connected' ? 'var(--grn-bg)' : qzStatus === 'off' ? 'var(--red-bg)' : 'var(--surf3)',
                color:      qzStatus === 'connected' ? 'var(--grn)'    : qzStatus === 'off' ? 'var(--red)'    : 'var(--txt3)',
                border: `1px solid ${qzStatus === 'connected' ? 'rgba(72,187,120,.3)' : qzStatus === 'off' ? 'rgba(245,101,101,.3)' : 'var(--bdr)'}`,
              }}>
                {qzStatus === 'idle' ? 'Not checked' : qzStatus === 'checking' ? 'Connecting…' : qzStatus === 'connected' ? 'Connected' : 'Not running'}
              </div>
              <button onClick={checkQZ} style={{ padding: '5px 16px', borderRadius: 'var(--r)', border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {qzStatus === 'checking' ? 'Connecting…' : 'Refresh'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.8, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '10px 14px' }}>
              <strong style={{ color: 'var(--txt2)' }}>First-time setup (one time only):</strong><br />
              1. Download &amp; install <strong>QZ Tray</strong> (free) from <strong>qz.io</strong><br />
              2. Launch QZ Tray — its icon will appear in the Windows system tray<br />
              3. Right-click the QZ Tray icon → <strong>Site Manager</strong> → add <strong>pos.soultiesseafoodjm.com</strong><br />
              4. Click <strong>Refresh</strong> above — status turns green when connected<br />
              5. Both your receipt and kitchen printers must be installed in Windows under <strong>Settings → Printers &amp; scanners</strong>
            </div>
          </div>

          {/* Detected printers + name fields */}
          <div style={section}>
            <div style={sectionTitle}>Printer Assignment</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 14 }}>
              Click <strong>Detect Printers</strong> to scan for available printers, then click <strong>→ Receipt</strong>, <strong>→ Kitchen</strong>, or <strong>→ Bar</strong> to assign each one.
            </div>

            {/* Find printers button + detected list */}
            <div style={{ marginBottom: 16 }}>
              <button onClick={fetchPrinters} disabled={fetchingPrinters} style={{
                marginBottom: 10, padding: '7px 18px', borderRadius: 'var(--r)', border: '1.5px solid var(--blue)',
                background: fetchingPrinters ? 'var(--surf3)' : 'var(--blue)', color: fetchingPrinters ? 'var(--txt3)' : '#fff',
                fontSize: 12, fontWeight: 700, cursor: fetchingPrinters ? 'not-allowed' : 'pointer',
              }}>{fetchingPrinters ? 'Scanning…' : 'Detect Printers'}</button>
              {printerError && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--r2)', border: '1px solid rgba(245,101,101,.3)' }}>
                  {printerError}
                </div>
              )}
              {qzPrinters.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {qzPrinters.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px' }}>
                      <span style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                      <button onClick={() => setPrinters({ receipt: p })} style={{
                        padding: '5px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--blue)',
                        background: form.printers?.receipt === p ? 'var(--blue)' : 'transparent',
                        color: form.printers?.receipt === p ? '#fff' : 'var(--blue)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>→ Receipt</button>
                      <button onClick={() => setPrinters({ kitchen: p })} style={{
                        padding: '5px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--grn)',
                        background: form.printers?.kitchen === p ? 'var(--grn)' : 'transparent',
                        color: form.printers?.kitchen === p ? '#fff' : 'var(--grn)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>→ Kitchen</button>
                      <button onClick={() => setPrinters({ bar: p })} style={{
                        padding: '5px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--pur)',
                        background: form.printers?.bar === p ? 'var(--pur)' : 'transparent',
                        color: form.printers?.bar === p ? '#fff' : 'var(--pur)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>→ Bar</button>
                    </div>
                  ))}
                </div>
              )}
              {qzStatus === 'off' && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>QZ Tray not running — start it from the system tray first.</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Pay / Receipt Printer</label>
                <input style={inp} placeholder="Exact Windows printer name" value={form.printers?.receipt ?? ''} onChange={e => setPrinters({ receipt: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Customer receipts after payment</div>
              </div>
              <div>
                <label style={lbl}>Kitchen Printer</label>
                <input style={inp} placeholder="Exact Windows printer name" value={form.printers?.kitchen ?? ''} onChange={e => setPrinters({ kitchen: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Food &amp; drink order tickets</div>
              </div>
              <div>
                <label style={lbl}>Bar Printer</label>
                <input style={inp} placeholder="Exact Windows printer name" value={form.printers?.bar ?? ''} onChange={e => setPrinters({ bar: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Bar tickets (falls back to kitchen if blank)</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Thermal Paper Width</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, maxWidth: 200 }}>
                {([58, 80] as const).map(w => (
                  <button key={w} onClick={() => setPrinters({ width: w })} style={{
                    flex: 1, padding: '9px 0', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    border: `2px solid ${(form.printers?.width ?? 80) === w ? 'var(--blue)' : 'var(--bdr)'}`,
                    background: (form.printers?.width ?? 80) === w ? 'var(--blue-bg)' : 'var(--surf)',
                    color: (form.printers?.width ?? 80) === w ? 'var(--blue)' : 'var(--txt3)',
                  }}>{w}mm</button>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)' }}>
              <input type="checkbox" checked={form.printers?.receiptPreview ?? false} onChange={e => setPrinters({ receiptPreview: e.target.checked })} />
              Receipt preview before printing (default: off — receipt prints silently after payment)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--txt2)', marginTop: 10 }}>
              <input type="checkbox" checked={form.printers?.drawerEnabled ?? false} onChange={e => setPrinters({ drawerEnabled: e.target.checked })} />
              Open cash drawer automatically after cash payments
            </label>
          </div>

          {/* Test prints */}
          <div style={section}>
            <div style={sectionTitle}>Test Prints</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 12 }}>
              {qzStatus === 'connected'
                ? 'QZ Tray connected — prints go silently to the named printer.'
                : 'QZ Tray not connected — buttons will open a browser print dialog instead.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <button onClick={() => testPrint('Receipt Test', `==== PAY / RECEIPT ====\n\n   TEST PRINT OK\n   ${new Date().toLocaleTimeString()}\n\n=======================`, form.printers?.receipt)} style={{
                padding: '12px 0', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)',
              }}>Test Receipt Printer</button>
              <button onClick={() => testPrint('Kitchen Test', `*** KITCHEN TICKET ***\n\n   TEST PRINT OK\n   ${new Date().toLocaleTimeString()}\n\n**********************`, form.printers?.kitchen, 58)} style={{
                padding: '12px 0', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)',
              }}>Test Kitchen Printer</button>
              <button onClick={() => testPrint('Bar Test', `====== BAR TICKET =====\n\n   TEST PRINT OK\n   ${new Date().toLocaleTimeString()}\n\n=======================`, form.printers?.bar || form.printers?.kitchen, 58)} style={{
                padding: '12px 0', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                border: '1.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--txt2)',
              }}>Test Bar Printer</button>
              <button onClick={testDrawer} style={{
                padding: '12px 0', borderRadius: 'var(--r)', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                border: '1.5px solid var(--grn)', background: 'var(--grn-bg)', color: 'var(--grn)',
              }}>Open Cash Drawer</button>
            </div>
          </div>
        </>
      )}

      {/* ── Modules ── */}
      {tab === 'modules' && (
        <>
          {(['restaurant','bar','carwash'] as const).map(m => (
            <div key={m} style={section}>
              <div style={sectionTitle}>{m.charAt(0).toUpperCase() + m.slice(1)}</div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Terminal Name</label>
                <input style={inp} value={form.modules[m].terminalName} onChange={e => setMod(m, { terminalName: e.target.value })} />
              </div>
              {m === 'restaurant' && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Dine-in Receipt Footer</label>
                    <input style={inp} value={form.modules.restaurant.dineInFooter} onChange={e => setMod(m, { dineInFooter: e.target.value })} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Takeout Receipt Footer</label>
                    <input style={inp} value={form.modules.restaurant.takeoutFooter} onChange={e => setMod(m, { takeoutFooter: e.target.value })} />
                  </div>
                  <div>
                    <label style={lbl}>Delivery Receipt Footer</label>
                    <input style={inp} value={form.modules.restaurant.deliveryFooter} onChange={e => setMod(m, { deliveryFooter: e.target.value })} />
                  </div>
                </>
              )}
              {(m === 'bar' || m === 'carwash') && (
                <div>
                  <label style={lbl}>Receipt Footer</label>
                  <input style={inp} value={(form.modules[m] as { footer: string }).footer} onChange={e => setMod(m, { footer: e.target.value })} />
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
