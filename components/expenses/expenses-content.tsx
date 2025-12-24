"use client"

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ProductCostTable } from './product-cost-table'
import { ProcurementCostTable } from './procurement-cost-table'
import { LogisticsCostTable } from './logistics-cost-table'
import { OperatingCostTable } from './operating-cost-table'
import { SummaryDashboard } from './summary-dashboard'
import { procurementData as initialProcurementData, logisticsData as initialLogisticsData, operatingData as initialOperatingData } from '@/app/api/expenses/mock-data'
import { ExpenseRecord } from './generic-expense-table'

type Tab = 'summary' | 'product_cost' | 'procurement' | 'logistics' | 'operational'

export function ExpensesContent() {
    const [activeTab, setActiveTab] = useState<Tab>('product_cost')

    // Lifted State
    const [procurementData, setProcurementData] = useState<ExpenseRecord[]>(initialProcurementData)
    const [logisticsData, setLogisticsData] = useState<ExpenseRecord[]>(initialLogisticsData)
    const [operatingData, setOperatingData] = useState<ExpenseRecord[]>(initialOperatingData)

    const tabs: { id: Tab; label: string }[] = [
        { id: 'summary', label: '汇总' },
        { id: 'product_cost', label: '产品费用' },
        { id: 'procurement', label: '采购费用' },
        { id: 'logistics', label: '物流费用' },
        { id: 'operational', label: '运营费用' },
    ]

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Financial Expenses</h1>
            </div>

            <div className="flex space-x-1 border-b">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
                            activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="mt-6">
                {activeTab === 'summary' && (
                    <SummaryDashboard
                        procurementData={procurementData}
                        logisticsData={logisticsData}
                        operatingData={operatingData}
                    />
                )}

                {activeTab === 'product_cost' && (
                    <ProductCostTable />
                )}

                {activeTab === 'procurement' && (
                    <ProcurementCostTable data={procurementData} onDataChange={setProcurementData} />
                )}

                {activeTab === 'logistics' && (
                    <LogisticsCostTable data={logisticsData} onDataChange={setLogisticsData} />
                )}

                {activeTab === 'operational' && (
                    <OperatingCostTable data={operatingData} onDataChange={setOperatingData} />
                )}
            </div>
        </div>
    )
}
