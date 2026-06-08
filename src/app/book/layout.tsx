import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Book a Car Wash — Soulties',
  description: 'Book a professional car wash at Soulties Car Wash, Ocho Rios, Jamaica.',
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
