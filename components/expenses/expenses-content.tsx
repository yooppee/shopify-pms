'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ProductCostTable } from './product-cost-table'

type Tab = 'summary' | 'product_cost' | 'procurement' | 'logistics' | 'operational'

export function ExpensesContent() {
    const [activeTab, setActiveTab] = useState<Tab>('product_cost')

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
                    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="text-muted-foreground text-center py-8">
                            Summary dashboard is coming soon.
                        </div>
                    </div>
                )}

                {activeTab === 'product_cost' && (
                    <ProductCostTable />
                )}

                {activeTab === 'procurement' && (
                    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="text-muted-foreground text-center py-8">
                            Procurement expenses tracking is coming soon.
                        </div>
                    </div>
                )}

                {activeTab === 'logistics' && (
                    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="text-muted-foreground text-center py-8">
                            Logistics expenses tracking is coming soon.
                        </div>
                    </div>
                )}

                {activeTab === 'operational' && (
                    <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="text-muted-foreground text-center py-8">
                            Operational expenses tracking is coming soon.
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
