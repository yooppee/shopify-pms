"use client"

import { GenericExpenseTable, ExpenseRecord } from "./generic-expense-table"

interface SettledCostTableProps {
    data: ExpenseRecord[]
    onDataChange: (data: ExpenseRecord[]) => void
    onSave: () => void
    isSaving: boolean
    unsavedCount: number
    onDiscard: () => void
}

export function SettledCostTable({ data, onDataChange, onSave, isSaving, unsavedCount, onDiscard }: SettledCostTableProps) {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold tracking-tight">已结算费用</h2>
                <p className="text-sm text-muted-foreground">(仅针对清算我们个人的垫付资金，对外不算)</p>
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
