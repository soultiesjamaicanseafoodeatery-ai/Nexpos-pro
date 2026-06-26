'use client'
import { useState } from 'react'
import { useApp } from '@/lib/hooks/useAppStore'
import type { FleetAccount, Vehicle } from '@/types'

const STATUS_COLOR: Record<string, string> = { active: 'var(--grn)', overdue: 'var(--red,#ef4444)', suspended: 'var(--ora)' }

const BILLING_CYCLES  = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly'] as const
const PAYMENT_TERMS   = ['Due on Receipt', 'Net 7', 'Net 14', 'Net 30'] as const
const ACCOUNT_TYPES   = ['Corporate', 'Government', 'NGO', 'Individual', 'Other'] as const
const VEHICLE_TYPES_L = ['Car', 'SUV', 'Pickup', 'Van', 'Truck', 'Bus'] as const

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--surf2)', border: '1.5px solid var(--bdr2)',
  borderRadius: 'var(--r2)', padding: '9px 11px', fontSize: 13, color: 'var(--txt)',
  boxSizing: 'border-box', outline: 'none',
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--txt3)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
}

interface AccountFormData {
  companyName: string; contactName: string; email: string; phone: string; address: string
  accountType: string; discount: string; creditLimit: string
  billingCycle: string; paymentTerms: string; notes: string
}

interface VehicleFormData {
  plate: string; make: string; model: string; year: string; color: string; type: string
}

const emptyAccount = (): AccountFormData => ({
  companyName: '', contactName: '', email: '', phone: '', address: '',
  accountType: 'Corporate', discount: '0', creditLimit: '50000',
  billingCycle: 'Monthly', paymentTerms: 'Net 30', notes: '',
})

const emptyVehicle = (): VehicleFormData => ({
  plate: '', make: '', model: '', year: new Date().getFullYear().toString(), color: '', type: 'Car',
})

export default function FleetPage() {
  const { state, dispatch } = useApp()
  const sym = state.biz.currencySymbol ?? 'J$'
  const fmt = (n: number) => sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fleet = state.fleet
  const [selected,      setSelected]      = useState<FleetAccount | null>(null)
  const [search,        setSearch]        = useState('')
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [showVehicle,   setShowVehicle]   = useState(false)
  const [editAccount,   setEditAccount]   = useState<FleetAccount | null>(null)
  const [form,          setForm]          = useState<AccountFormData>(emptyAccount())
  const [vehicleForm,   setVehicleForm]   = useState<VehicleFormData>(emptyVehicle())
  const [saving,        setSaving]        = useState(false)

  const filtered = fleet.filter(a => {
    const q = search.toLowerCase()
    return !q || a.companyName.toLowerCase().includes(q) || a.contactName.toLowerCase().includes(q) || a.accountType.toLowerCase().includes(q)
  })

  const totalBalance = fleet.reduce((s, a) => s + a.currentBalance, 0)
  const totalCredit  = fleet.reduce((s, a) => s + a.creditLimit, 0)

  function openAddModal() {
    setEditAccount(null)
    setForm(emptyAccount())
    setShowAddModal(true)
  }

  function openEditModal(a: FleetAccount) {
    setEditAccount(a)
    setForm({
      companyName: a.companyName, contactName: a.contactName,
      email: a.email, phone: a.phone, address: a.address,
      accountType: a.accountType, discount: String(a.discount),
      creditLimit: String(a.creditLimit), billingCycle: a.billingCycle,
      paymentTerms: a.paymentTerms, notes: a.notes,
    })
    setShowAddModal(true)
  }

  function saveAccount() {
    if (!form.companyName.trim() || !form.contactName.trim()) return
    setSaving(true)
    if (editAccount) {
      const updated: FleetAccount = {
        ...editAccount,
        companyName:  form.companyName.trim(),
        contactName:  form.contactName.trim(),
        email:        form.email.trim(),
        phone:        form.phone.trim(),
        address:      form.address.trim(),
        accountType:  form.accountType,
        discount:     parseFloat(form.discount) || 0,
        creditLimit:  parseFloat(form.creditLimit) || 0,
        billingCycle: form.billingCycle,
        paymentTerms: form.paymentTerms,
        notes:        form.notes.trim(),
      }
      dispatch({ type: 'UPDATE_FLEET_ACCOUNT', account: updated })
      setSelected(updated)
    } else {
      const account: FleetAccount = {
        id:             crypto.randomUUID(),
        companyName:    form.companyName.trim(),
        contactName:    form.contactName.trim(),
        email:          form.email.trim(),
        phone:          form.phone.trim(),
        address:        form.address.trim(),
        accountType:    form.accountType,
        discount:       parseFloat(form.discount) || 0,
        creditLimit:    parseFloat(form.creditLimit) || 0,
        currentBalance: 0,
        billingCycle:   form.billingCycle,
        paymentTerms:   form.paymentTerms,
        status:         'active',
        created:        new Date().toISOString(),
        accountManager: state.currentUser?.name ?? '',
        notes:          form.notes.trim(),
        vehicles:       [],
        invoices:       [],
      }
      dispatch({ type: 'ADD_FLEET_ACCOUNT', account })
    }
    setSaving(false)
    setShowAddModal(false)
  }

  function saveVehicle() {
    if (!selected || !vehicleForm.plate.trim()) return
    const v: Vehicle = {
      id:    crypto.randomUUID(),
      plate: vehicleForm.plate.trim().toUpperCase(),
      make:  vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year:  parseInt(vehicleForm.year) || new Date().getFullYear(),
      color: vehicleForm.color.trim(),
      type:  vehicleForm.type,
      washes: 0,
    }
    const updated: FleetAccount = { ...selected, vehicles: [...selected.vehicles, v] }
    dispatch({ type: 'UPDATE_FLEET_ACCOUNT', account: updated })
    setSelected(updated)
    setShowVehicle(false)
    setVehicleForm(emptyVehicle())
  }

  function deleteVehicle(vehicleId: string) {
    if (!selected) return
    const updated: FleetAccount = { ...selected, vehicles: selected.vehicles.filter(v => v.id !== vehicleId) }
    dispatch({ type: 'UPDATE_FLEET_ACCOUNT', account: updated })
    setSelected(updated)
  }

  const f = (k: keyof AccountFormData, v: string) => setForm(prev => ({ ...prev, [k]: v }))
  const vf = (k: keyof VehicleFormData, v: string) => setVehicleForm(prev => ({ ...prev, [k]: v }))

  return (
    <div style={{ padding: '18px 20px', overflowY: 'auto', height: '100%', flex: 1 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.4px' }}>Fleet Accounts</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
            {fleet.length} accounts · {fmt(totalBalance)} outstanding · {fmt(totalCredit)} credit limit
          </div>
        </div>
        <button
          onClick={openAddModal}
          style={{ padding: '9px 18px', borderRadius: 'var(--r2)', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          + Add Account
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 400px' : '1fr', gap: 16 }}>

        {/* Account list */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, contact…"
              style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r2)', padding: '8px 12px', fontSize: 13, color: 'var(--txt)', width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>
                No fleet accounts.{' '}
                <button onClick={openAddModal} style={{ background: 'none', border: 'none', color: 'var(--blue)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  Add one →
                </button>
              </div>
            ) : filtered.map(a => {
              const sel = selected?.id === a.id
              return (
                <div key={a.id} onClick={() => setSelected(sel ? null : a)} style={{
                  padding: '13px 16px', borderBottom: '1px solid var(--bdr2)', cursor: 'pointer',
                  background: sel ? 'var(--surf2)' : 'transparent', display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)' }}>{a.companyName}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{a.contactName} · {a.phone} · {a.vehicles.length} vehicles</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: a.currentBalance > 0 ? 'var(--red,#ef4444)' : 'var(--txt)' }}>{fmt(a.currentBalance)}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[a.status] ?? 'var(--txt3)', textTransform: 'capitalize', marginTop: 2 }}>{a.status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--r3)', padding: 18, alignSelf: 'start', position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)' }}>{selected.companyName}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.contactName} · {selected.email}</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{selected.phone}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => openEditModal(selected)} style={{ padding: '5px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Account Type', value: selected.accountType },
                { label: 'Status', value: selected.status, color: STATUS_COLOR[selected.status] },
                { label: 'Discount', value: `${selected.discount}%` },
                { label: 'Credit Limit', value: fmt(selected.creditLimit) },
                { label: 'Balance', value: fmt(selected.currentBalance), color: selected.currentBalance > 0 ? 'var(--red,#ef4444)' : 'var(--grn)' },
                { label: 'Billing', value: `${selected.billingCycle} · ${selected.paymentTerms}` },
              ].map(row => (
                <div key={row.label} style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{row.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: row.color ?? 'var(--txt)', textTransform: 'capitalize' }}>{row.value}</div>
                </div>
              ))}
            </div>

            {/* Vehicles */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Vehicles ({selected.vehicles.length})</div>
              <button onClick={() => { setVehicleForm(emptyVehicle()); setShowVehicle(true) }} style={{ padding: '4px 10px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 800, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Add</button>
            </div>
            {selected.vehicles.map(v => (
              <div key={v.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--txt)' }}>{v.plate}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{v.year} {v.make} {v.model}{v.color ? ` · ${v.color}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 700 }}>{v.washes ?? 0} washes</div>
                  <button onClick={() => deleteVehicle(v.id!)} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              </div>
            ))}

            {/* Invoices */}
            {selected.invoices.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, marginTop: 14 }}>Invoices</div>
                {selected.invoices.map(inv => (
                  <div key={inv.id} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 'var(--r)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt)' }}>{inv.id}</div>
                      <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{inv.date} · {inv.items} items</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt)' }}>{fmt(inv.amount)}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: inv.status === 'paid' ? 'var(--grn)' : 'var(--red,#ef4444)', textTransform: 'capitalize' }}>{inv.status}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {selected.notes && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#78350f11', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--txt3)', borderLeft: '3px solid var(--ora)' }}>
                {selected.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit Account Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--txt)' }}>{editAccount ? 'Edit Account' : 'New Fleet Account'}</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={label}>Company / Fleet Name *</span>
                <input style={inp} value={form.companyName} onChange={e => f('companyName', e.target.value)} placeholder="e.g. Acme Corp" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={label}>Contact Name *</span>
                <input style={inp} value={form.contactName} onChange={e => f('contactName', e.target.value)} placeholder="Primary contact" />
              </div>
              <div>
                <span style={label}>Phone</span>
                <input style={inp} value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="876-XXX-XXXX" />
              </div>
              <div>
                <span style={label}>Email</span>
                <input style={inp} value={form.email} onChange={e => f('email', e.target.value)} placeholder="billing@company.com" type="email" />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={label}>Address</span>
                <input style={inp} value={form.address} onChange={e => f('address', e.target.value)} placeholder="Company address" />
              </div>
              <div>
                <span style={label}>Account Type</span>
                <select style={inp} value={form.accountType} onChange={e => f('accountType', e.target.value)}>
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <span style={label}>Discount (%)</span>
                <input style={inp} type="number" min={0} max={100} value={form.discount} onChange={e => f('discount', e.target.value)} />
              </div>
              <div>
                <span style={label}>Credit Limit ({sym})</span>
                <input style={inp} type="number" min={0} value={form.creditLimit} onChange={e => f('creditLimit', e.target.value)} />
              </div>
              <div>
                <span style={label}>Billing Cycle</span>
                <select style={inp} value={form.billingCycle} onChange={e => f('billingCycle', e.target.value)}>
                  {BILLING_CYCLES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={label}>Payment Terms</span>
                <select style={inp} value={form.paymentTerms} onChange={e => f('paymentTerms', e.target.value)}>
                  {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={label}>Notes</span>
                <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Internal notes about this account…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--r2)', background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={saveAccount}
                disabled={saving || !form.companyName.trim() || !form.contactName.trim()}
                style={{ flex: 2, padding: '12px 0', borderRadius: 'var(--r2)', background: form.companyName.trim() && form.contactName.trim() ? 'var(--blue)' : 'var(--bdr)', color: form.companyName.trim() && form.contactName.trim() ? '#fff' : 'var(--txt3)', fontWeight: 800, fontSize: 14, border: 'none', cursor: form.companyName.trim() && form.contactName.trim() ? 'pointer' : 'not-allowed' }}
              >
                {editAccount ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Vehicle Modal ── */}
      {showVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--r3)', width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--txt)' }}>Add Vehicle</div>
              <button onClick={() => setShowVehicle(false)} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={label}>License Plate *</span>
                <input style={{ ...inp, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '2px', fontSize: 15 }} value={vehicleForm.plate} onChange={e => vf('plate', e.target.value.toUpperCase())} placeholder="ABC-1234" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={label}>Make</span>
                  <input style={inp} value={vehicleForm.make} onChange={e => vf('make', e.target.value)} placeholder="Toyota" />
                </div>
                <div>
                  <span style={label}>Model</span>
                  <input style={inp} value={vehicleForm.model} onChange={e => vf('model', e.target.value)} placeholder="Hilux" />
                </div>
                <div>
                  <span style={label}>Year</span>
                  <input style={inp} type="number" value={vehicleForm.year} onChange={e => vf('year', e.target.value)} />
                </div>
                <div>
                  <span style={label}>Color</span>
                  <input style={inp} value={vehicleForm.color} onChange={e => vf('color', e.target.value)} placeholder="White" />
                </div>
              </div>
              <div>
                <span style={label}>Vehicle Type</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {VEHICLE_TYPES_L.map(t => (
                    <button key={t} onClick={() => vf('type', t)} style={{ padding: '6px 12px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '2px solid', borderColor: vehicleForm.type === t ? 'var(--blue)' : 'var(--bdr)', background: vehicleForm.type === t ? 'var(--blue-bg)' : 'var(--surf2)', color: vehicleForm.type === t ? 'var(--blue)' : 'var(--txt2)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowVehicle(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--r2)', background: 'var(--surf2)', border: '1px solid var(--bdr)', color: 'var(--txt)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={saveVehicle}
                disabled={!vehicleForm.plate.trim()}
                style={{ flex: 2, padding: '12px 0', borderRadius: 'var(--r2)', background: vehicleForm.plate.trim() ? 'var(--blue)' : 'var(--bdr)', color: vehicleForm.plate.trim() ? '#fff' : 'var(--txt3)', fontWeight: 800, fontSize: 14, border: 'none', cursor: vehicleForm.plate.trim() ? 'pointer' : 'not-allowed' }}
              >
                Add Vehicle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
