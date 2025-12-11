import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { QueryProvider } from "./query-provider"
import { Toaster } from "react-hot-toast"
import { SidebarProvider } from "@/components/providers/sidebar-provider"
import "./globals.css"

const inter = Inter({
    subsets: ["latin"],
    variable: '--font-sans',
})

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: '--font-mono',
})

export const metadata: Metadata = {
    title: "Shopify PMS - Product Management System",
    description: "E-commerce Product Management System with Analytics",
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
                <QueryProvider>
                    <SidebarProvider>
                        {children}
                    </SidebarProvider>
                </QueryProvider>
                <Toaster position="top-right" />
            </body>
        </html>
    )
}
