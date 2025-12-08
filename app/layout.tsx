import type { Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { QueryProvider } from "./query-provider"
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
                    {children}
                </QueryProvider>
            </body>
        </html>
    )
}
