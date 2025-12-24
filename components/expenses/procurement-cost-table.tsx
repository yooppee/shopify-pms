"use client"

import { GenericExpenseTable, ExpenseRecord } from "./generic-expense-table"
// import { procurementData } from "@/app/api/expenses/mock-data"

interface ProcurementCostTableProps {
    data: ExpenseRecord[]
    onDataChange: (data: ExpenseRecord[]) => void
    onSave: () => void
    isSaving: boolean
    unsavedCount: number
    onDiscard: () => void
}

export function ProcurementCostTable({ data, onDataChange, onSave, isSaving, unsavedCount, onDiscard }: ProcurementCostTableProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">采购费用</h2>
                {/* Add buttons here later if needed */}
            </div>
            <GenericExpenseTable
                data={data}
                onDataChange={onDataChange}
                onSave={onSave}
                isSaving={isSaving}
                unsavedCount={unsavedCount}
                onDiscard={onDiscard}
            />
        </div>
    )
}
