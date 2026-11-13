import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/app-shell'
export const metadata: Metadata = { title: 'Nexo CRM Comercial', description: 'Relacionamento, oportunidades e propostas comerciais.' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><AppShell>{children}</AppShell></body></html> }
