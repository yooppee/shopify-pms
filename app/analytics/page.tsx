import { Sidebar } from '@/components/layout/sidebar'
import { BarChart3 } from 'lucide-react'

export default function AnalyticsPage() {
    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="container mx-auto p-6">
                    <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
                        <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Analytics & Recommendations</h2>
                        <p className="text-muted-foreground text-center max-w-md">
                            Track user events and view product recommendations based on viewing patterns.
                            Coming soon!
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
