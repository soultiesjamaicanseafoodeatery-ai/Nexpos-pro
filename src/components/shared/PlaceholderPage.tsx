interface Props {
  icon: string
  title: string
  desc: string
}

export default function PlaceholderPage({ icon, title, desc }: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 52, marginBottom: 16, opacity: .4 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 340 }}>{desc}</div>
    </div>
  )
}
