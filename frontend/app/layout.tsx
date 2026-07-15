import './globals.css'; import { Providers } from '@/components/providers';
export const metadata={title:'Relay · Voice platform',description:'Enterprise AI voice operations'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>}
