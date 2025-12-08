import { Sidebar } from '@/components/layout/sidebar'
import { FileText } from 'lucide-react'

export default function ListingsPage() {
    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="container mx-auto p-6">
                    <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
                        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Listing Optimizer</h2>
                        <p className="text-muted-foreground text-center max-w-md">
                            This module will allow you to optimize product listings before publishing.
                            Coming soon!
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
