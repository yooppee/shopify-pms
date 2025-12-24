"use client"

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ProductCostTable } from './product-cost-table'
import { ProcurementCostTable } from './procurement-cost-table'
import { LogisticsCostTable } from './logistics-cost-table'
import { OperatingCostTable } from './operating-cost-table'
import { SummaryDashboard } from './summary-dashboard'
// import { procurementData as initialProcurementData, logisticsData as initialLogisticsData, operatingData as initialOperatingData } from '@/app/api/expenses/mock-data'
import { ExpenseRecord } from './generic-expense-table'

type Tab = 'summary' | 'product_cost' | 'procurement' | 'logistics' | 'operational'

export function ExpensesContent() {
    const [activeTab, setActiveTab] = useState<Tab>('summary') // Default to summary or keep product_cost

    // Lifted State
    const [procurementData, setProcurementData] = useState<ExpenseRecord[]>([])
    const [logisticsData, setLogisticsData] = useState<ExpenseRecord[]>([])
    const [operatingData, setOperatingData] = useState<ExpenseRecord[]>([])

    // Original State for Change Tracking
    const [originalProcurementData, setOriginalProcurementData] = useState<ExpenseRecord[]>([])
    const [originalLogisticsData, setOriginalLogisticsData] = useState<ExpenseRecord[]>([])
    const [originalOperatingData, setOriginalOperatingData] = useState<ExpenseRecord[]>([])

    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    // Helper to calculate diff count
    const getUnsavedCount = (current: ExpenseRecord[], original: ExpenseRecord[]) => {
        if (current === original) return 0

        let count = 0
        const originalMap = new Map(original.map(r => [r.id, r]))
        const currentMap = new Map(current.map(r => [r.id, r]))

        // Check for additions and modifications
        for (const r of current) {
            const orig = originalMap.get(r.id)
            if (!orig) {
                count++ // Added
            } else {
                // Check content fields
                if (
                    r.item !== orig.item ||
                    r.amountRMB !== orig.amountRMB ||
                    r.amountUSD !== orig.amountUSD ||
                    r.person !== orig.person ||
                    r.date.getTime() !== orig.date.getTime()
                ) {
                    count++ // Modified
                }
            }
        }

        // Check for deletions
        for (const r of original) {
            if (!currentMap.has(r.id)) {
                count++ // Deleted
            }
        }

        return count
    }

    const procurementChanges = getUnsavedCount(procurementData, originalProcurementData)
    const logisticsChanges = getUnsavedCount(logisticsData, originalLogisticsData)
    const operatingChanges = getUnsavedCount(operatingData, originalOperatingData)


    // Initial Fetch
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true)
            try {
                // Fetch all types in parallel
                const [procurementRes, logisticsRes, operatingRes] = await Promise.all([
                    fetch('/api/expenses?type=procurement'),
                    fetch('/api/expenses?type=logistics'),
                    fetch('/api/expenses?type=operating')
                ])

                const [procurementJson, logisticsJson, operatingJson] = await Promise.all([
                    procurementRes.json(),
                    logisticsRes.json(),
                    operatingRes.json()
                ])

                if (procurementJson.success) {
                    const data = procurementJson.data.map((r: any) => ({
                        ...r,
                        date: r.date ? new Date(r.date) : new Date()
                    }))
                    setProcurementData(data)
                    setOriginalProcurementData(data)
                }
                if (logisticsJson.success) {
                    const data = logisticsJson.data.map((r: any) => ({
                        ...r,
                        date: r.date ? new Date(r.date) : new Date()
                    }))
                    setLogisticsData(data)
                    setOriginalLogisticsData(data)
                }
                if (operatingJson.success) {
                    const data = operatingJson.data.map((r: any) => ({
                        ...r,
                        date: r.date ? new Date(r.date) : new Date()
                    }))
                    setOperatingData(data)
                    setOriginalOperatingData(data)
                }

            } catch (error) {
                console.error("Failed to fetch expenses:", error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // Only save if dirty? Or just save all for simplicity?
            // Saving all ensures consistency, but we can reset original data for all on success.
            await Promise.all([
                fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'procurement', expenses: procurementData })
                }),
                fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'logistics', expenses: logisticsData })
                }),
                fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'operating', expenses: operatingData })
                })
            ])

            // Update originals to match current state
            setOriginalProcurementData(procurementData)
            setOriginalLogisticsData(logisticsData)
            setOriginalOperatingData(operatingData)

            // Alert is annoying if frequent, maybe toast? For now native alert is fine as requested implicitly.
            // alert("All changes saved successfully!") 
        } catch (error) {
            console.error("Failed to save changes:", error)
            alert("Failed to save changes. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

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

            {isLoading ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                    Loading expenses...
                </div>
            ) : (
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
                        <ProcurementCostTable
                            data={procurementData}
                            onDataChange={setProcurementData}
                            onSave={handleSave}
                            isSaving={isSaving}
                            unsavedCount={procurementChanges}
                        />
                    )}

                    {activeTab === 'logistics' && (
                        <LogisticsCostTable
                            data={logisticsData}
                            onDataChange={setLogisticsData}
                            onSave={handleSave}
                            isSaving={isSaving}
                            unsavedCount={logisticsChanges}
                        />
                    )}

                    {activeTab === 'operational' && (
                        <OperatingCostTable
                            data={operatingData}
                            onDataChange={setOperatingData}
                            onSave={handleSave}
                            isSaving={isSaving}
                            unsavedCount={operatingChanges}
                        />
                    )}
                </div>
            )}
        </div>
    )
}
