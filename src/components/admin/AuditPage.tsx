'use client'
import { useState } from 'react' 
import { useApp } from '@/lib/hooks/useAppSt ore'

const TYPE_COLOR: Record<string, string > = {
  info:    'var(--blue)',
  warn:    'v ar(--ora)',
  error:   'var(--red,#ef4444)',
   success: 'var(--grn)',
}
const TYPE_BG: Rec ord<string, string> = {
  info:    '#1e3a5f22 ',
  warn:    '#78350f22',
  error:   '#7f1d1 d22',
  success: '#14532d22',
}

export defau lt function AuditPage() {
  const { state } =  useApp()
  const [search, setSearch] = useSt ate('')
  const [typeFilter, setTypeFilter] =  useState('all')
  const [modFilter, setModFi lter]   = useState('all')

  const entries =  state.audit.filter(e => {
    if (typeFilter  !== 'all' && e.type !== typeFilter) return fa lse
    if (modFilter  !== 'all' && e.mod  != = modFilter)  return false
    if (search) {
       const q = search.toLowerCase()
      re turn e.action.toLowerCase().includes(q) || e. detail.toLowerCase().includes(q) || e.user.to LowerCase().includes(q)
    }
    return true 
  })
  const exportCSV = () => {
    const h eaders = ['Timestamp', 'Type', 'Module', 'Use r', 'Action', 'Detail']
    const rows = entr ies.map(e => [
      e.ts ?? '',
      e.type  ?? '',
      e.mod ?? '',
      e.user ?? '' ,
      e.action ?? '',
      String(e.detail  ?? '').replace(/"/g, '""'),
    ])
    const  csv = [headers, ...rows].map(r => r.map(v =>  `"${v}"`).join(',')).join('\n')
    const bl ob = new Blob([csv], { type: 'text/csv' })
     const url = URL.createObjectURL(blob)
    c onst a = document.createElement('a')
    a.hr ef = url
    a.download = `audit-log-${new Da te().toISOString().slice(0,10)}.csv`
    a.cl ick()
    URL.revokeObjectURL(url)
  }

  ret urn (
    <div style={{ padding: '18px 20px',  overflowY: 'auto', height: '100%', flex: 1 } }>
      <div style={{ display: 'flex', align Items: 'flex-start', justifyContent: 'space-b etween', marginBottom: 15 }}>
        <div>
           <div style={{ fontSize: 18, fontWeig ht: 800, color: 'var(--txt)', letterSpacing:  '-.4px' }}>Audit Log</div>
          <div sty le={{ fontSize: 12, color: 'var(--txt3)', mar ginTop: 3 }}>{entries.length} entries</div>
         </div>
      </div>

      {/* Filters  */}
      <div style={{ background: 'var(--s urf)', border: '1px solid var(--bdr)', border Radius: 'var(--r3)', overflow: 'hidden', marg inBottom: 13 }}>
        <div style={{ paddin g: '9px 12px', borderBottom: '1px solid var(- -bdr)', display: 'flex', alignItems: 'center' , gap: 8, flexWrap: 'wrap' }}>
          <inp ut value={search} onChange={e => setSearch(e. target.value)} placeholder="Search action, de tail, user…"
            style={{ backgroun d: 'var(--bg3)', border: '1px solid var(--bdr )', borderRadius: 'var(--r2)', padding: '6px  10px', fontSize: 12, color: 'var(--txt)', wid th: 220 }} />

          {['all','info','warn ','error','success'].map(t => (
            < button key={t} onClick={() => setTypeFilter(t )} style={{
              padding: '5px 12px' , borderRadius: 20, fontSize: 11, fontWeight:  700, cursor: 'pointer',
              border : `1.5px solid ${typeFilter === t ? 'transpar ent' : 'var(--bdr)'}`,
              backgrou nd: typeFilter === t ? (t === 'all' ? 'var(-- blue)' : TYPE_COLOR[t]) : 'transparent',
               color: typeFilter === t ? '#fff' :  'var(--txt3)',
            }}>{t.charAt(0).to UpperCase() + t.slice(1)}</button>
           ))}

          <select value={modFilter} onCh ange={e => setModFilter(e.target.value)}
             style={{ background: 'var(--bg3)', bo rder: '1px solid var(--bdr)', borderRadius: ' var(--r2)', padding: '5px 8px', fontSize: 12,  color: 'var(--txt)' }}>
            <option  value="all">All Modules</option>
             <option value="restaurant">Restaurant</option >
            <option value="bar">Bar</option >
            <option value="carwash">Car Was h</option>
          </select>
        </div> 

        {entries.length === 0 ? (
           <div style={{ padding: 32, textAlign: 'cente r', color: 'var(--txt3)', fontSize: 13 }}>
             No audit entries yet — actions ta ken in the POS will appear here.
          </ div>
        ) : (
          <div style={{ ov erflowX: 'auto' }}>
            <table style= {{ width: '100%', borderCollapse: 'collapse',  fontSize: 12 }}>
              <thead>
                 <tr style={{ borderBottom: '1px so lid var(--bdr)', background: 'var(--bg3)' }}> 
                  {['Time','Type','Module',' User','Action','Detail'].map(h => (
                     <th key={h} style={{ padding: '8px  12px', textAlign: 'left', fontWeight: 700, c olor: 'var(--txt3)', fontSize: 11, whiteSpace : 'nowrap' }}>{h}</th>
                  ))}
                 </tr>
              </thead>
               <tbody>
                {entrie s.map(e => (
                  <tr key={e.id}  style={{ borderBottom: '1px solid var(--bdr2 )', verticalAlign: 'top' }}>
                     <td style={{ padding: '9px 12px', color:  'var(--txt3)', whiteSpace: 'nowrap', fontFami ly: 'var(--mono)', fontSize: 11 }}>{e.ts}</td >
                    <td style={{ padding: ' 9px 12px' }}>
                      <span sty le={{ fontSize: 10, fontWeight: 700, padding:  '2px 7px', borderRadius: 8, background: TYPE _BG[e.type], color: TYPE_COLOR[e.type], textT ransform: 'uppercase' }}>{e.type}</span>
                     </td>
                    <td  style={{ padding: '9px 12px', color: 'var(-- txt3)', textTransform: 'capitalize' }}>{e.mod }</td>
                    <td style={{ paddi ng: '9px 12px', color: 'var(--txt2)', fontWei ght: 600, whiteSpace: 'nowrap' }}>{e.user}</t d>
                    <td style={{ padding:  '9px 12px', color: 'var(--txt)', fontWeight:  700 }}>{e.action}</td>
                    <t d style={{ padding: '9px 12px', color: 'var(- -txt3)', maxWidth: 320 }}>{e.detail}</td>
                   </tr>
                ))}
               </tbody>
            </table>
           </div>
        )}
      </div>
    </div >
  )
}
 