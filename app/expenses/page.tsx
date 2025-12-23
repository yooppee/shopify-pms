import { Sidebar } from '@/components/layout/sidebar'
import { ExpensesContent } from '@/components/expenses/expenses-content'

export default function ExpensesPage() {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background">
                <ExpensesContent />
            </main>
        </div>
    )
}
