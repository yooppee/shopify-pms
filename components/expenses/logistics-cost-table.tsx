"use client"

import { GenericExpenseTable, ExpenseRecord } from "./generic-expense-table"
// import { logisticsData } from "@/app/api/expenses/mock-data"

interface LogisticsCostTableProps {
    data: ExpenseRecord[]
    onDataChange: (data: ExpenseRecord[]) => void
    onSave: () => void
    isSaving: boolean
    unsavedCount: number
}

export function LogisticsCostTable({ data, onDataChange, onSave, isSaving, unsavedCount }: LogisticsCostTableProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">物流费用</h2>
                {/* Add buttons here later if needed */}
            </div>
            <GenericExpenseTable
                data={data}
                onDataChange={onDataChange}
                onSave={onSave}
                isSaving={isSaving}
                unsavedCount={unsavedCount}
            />
        </div>
    )
}
