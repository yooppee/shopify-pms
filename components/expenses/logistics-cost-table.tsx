"use client"

import { GenericExpenseTable, ExpenseRecord } from "./generic-expense-table"
// import { logisticsData } from "@/app/api/expenses/mock-data"

interface LogisticsCostTableProps {
    data: ExpenseRecord[]
    onDataChange: (data: ExpenseRecord[]) => void
}

export function LogisticsCostTable({ data, onDataChange }: LogisticsCostTableProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">物流费用</h2>
            </div>
            <GenericExpenseTable data={data} onDataChange={onDataChange} />
        </div>
    )
}
