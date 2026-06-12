'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import { supabase } from '@/lib/supabase'
import type { BusinessConfig } from '@/types'

type Tab = 'business' | 'tax' | 'receipt' | 'modules'

const TABS: { id: Tab; label: string }[] = [
  { id: 'business', label: 'Business Info' },
  { id: 'tax',      label: 'Tax & Fees' },
  { id: 'receipt',  label: 'Receipt' },
  { id: 'modules',  label: 'Modules' },
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

  const handleSave = async () => {
    setSaving(true)
    try {
      dispatch({ type: 'SET_BIZ', biz: form })
      if (supabase) {
        await supabase.from('business_config').upsert({ id: 'main', data: form, updated_at: new Date().toISOString() })
      }
      setDirty(false)
      toast('Settings saved', 'success')
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

      {/* ── Tax & Fees ── */}
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
