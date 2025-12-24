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

    // Helper to flatten hierarchy for comparison
    const flattenForDiff = (records: ExpenseRecord[]): ExpenseRecord[] => {
        let flat: ExpenseRecord[] = []
        for (const r of records) {
            flat.push(r)
            if (r.children && r.children.length > 0) {
                flat = flat.concat(flattenForDiff(r.children))
            }
        }
        return flat
    }

    // Helper to calculate diff count
    const getUnsavedCount = (current: ExpenseRecord[], original: ExpenseRecord[]) => {
        if (current === original) return 0

        const flatCurrent = flattenForDiff(current)
        const flatOriginal = flattenForDiff(original)

        let count = 0
        const originalMap = new Map(flatOriginal.map(r => [r.id, r]))
        const currentMap = new Map(flatCurrent.map(r => [r.id, r]))

        // Check for additions and modifications
        for (const r of flatCurrent) {
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
                    r.date.getTime() !== orig.date.getTime() ||
                    r.parentId !== orig.parentId || // Check parent changes
                    r.isGroup !== orig.isGroup
                ) {
                    count++ // Modified
                }
            }
        }

        // Check for deletions
        for (const r of flatOriginal) {
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
                    const hierarchicalData = buildHierarchy(data)
                    setProcurementData(hierarchicalData)
                    setOriginalProcurementData(hierarchicalData)
                }
                if (logisticsJson.success) {
                    const data = logisticsJson.data.map((r: any) => ({
                        ...r,
                        date: r.date ? new Date(r.date) : new Date()
                    }))
                    const hierarchicalData = buildHierarchy(data)
                    setLogisticsData(hierarchicalData)
                    setOriginalLogisticsData(hierarchicalData)
                }
                if (operatingJson.success) {
                    const data = operatingJson.data.map((r: any) => ({
                        ...r,
                        date: r.date ? new Date(r.date) : new Date()
                    }))
                    const hierarchicalData = buildHierarchy(data)
                    setOperatingData(hierarchicalData)
                    setOriginalOperatingData(hierarchicalData)
                }

            } catch (error) {
                console.error("Failed to fetch expenses:", error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    const buildHierarchy = (flatData: any[]) => {
        const dataMap: Record<string, any> = {}
        // First pass: create nodes
        flatData.forEach(item => {
            dataMap[item.id] = { ...item, children: [] }
        })
        const roots: any[] = []
        // Second pass: link parent/child
        flatData.forEach(item => {
            if (item.parentId && dataMap[item.parentId]) {
                dataMap[item.parentId].children.push(dataMap[item.id])
            } else {
                roots.push(dataMap[item.id])
            }
        })
        return roots
    }

    const handleSave = async (type: 'procurement' | 'logistics' | 'operating', currentData: ExpenseRecord[], originalData: ExpenseRecord[]) => {
        setIsSaving(true)
        try {
            await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, expenses: currentData })
            })

            // Update originals to match current state
            if (type === 'procurement') setOriginalProcurementData(currentData)
            if (type === 'logistics') setOriginalLogisticsData(currentData)
            if (type === 'operating') setOriginalOperatingData(currentData)

            toast.success("Changes saved successfully")
        } catch (error) {
            console.error("Failed to save changes:", error)
            toast.error("Failed to save changes")
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
                            onSave={() => handleSave('procurement', procurementData, originalProcurementData)}
                            isSaving={isSaving}
                            unsavedCount={procurementChanges}
                            onDiscard={() => setProcurementData(structuredClone(originalProcurementData))}
                        />
                    )}

                    {activeTab === 'logistics' && (
                        <LogisticsCostTable
                            data={logisticsData}
                            onDataChange={setLogisticsData}
                            onSave={() => handleSave('logistics', logisticsData, originalLogisticsData)}
                            isSaving={isSaving}
                            unsavedCount={logisticsChanges}
                            onDiscard={() => setLogisticsData(structuredClone(originalLogisticsData))}
                        />
                    )}

                    {activeTab === 'operational' && (
                        <OperatingCostTable
                            data={operatingData}
                            onDataChange={setOperatingData}
                            onSave={() => handleSave('operating', operatingData, originalOperatingData)}
                            isSaving={isSaving}
                            unsavedCount={operatingChanges}
                            onDiscard={() => setOperatingData(structuredClone(originalOperatingData))}
                        />
                    )}
                </div>
            )}
        </div>
    )
}
