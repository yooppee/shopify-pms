"use client"

import { useState, useMemo } from "react"
import { format, isSameMonth, parseISO } from "date-fns"
import { ExpenseRecord } from "./generic-expense-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency, formatNumber } from "@/lib/utils"

interface SummaryDashboardProps {
    procurementData: ExpenseRecord[]
    logisticsData: ExpenseRecord[]
    operatingData: ExpenseRecord[]
}

export function SummaryDashboard({ procurementData, logisticsData, operatingData }: SummaryDashboardProps) {
    // Collect all available months from data
    const availableMonths = useMemo(() => {
        const allDates = [
            ...procurementData,
            ...logisticsData,
            ...operatingData
        ]
            .filter(r => r.date) // Ensure date exists
            .map(r => {
                try {
                    return new Date(r.date)
                } catch {
                    return null
                }
            })
            .filter(d => d && !isNaN(d.getTime())) // Filter invalid dates

        // Sort distinct months (YYYY-MM)
        const months = new Set(allDates.map(d => format(d!, 'yyyy-MM')))
        const sorted = Array.from(months).sort().reverse() // Latest first
        return sorted.length > 0 ? sorted : [format(new Date(), 'yyyy-MM')]
    }, [procurementData, logisticsData, operatingData])

    const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || format(new Date(), 'yyyy-MM'))

    // Filter data by selected month
    const filteredData = useMemo(() => {
        if (!selectedMonth) return { procurement: [], logistics: [], operating: [] }

        const targetDate = new Date(selectedMonth + '-01')

        const filterFn = (r: ExpenseRecord) => {
            if (!r.date) return false
            try {
                const d = new Date(r.date)
                if (isNaN(d.getTime())) return false
                return isSameMonth(d, targetDate)
            } catch {
                return false
            }
        }

        return {
            procurement: procurementData.filter(filterFn),
            logistics: logisticsData.filter(filterFn),
            operating: operatingData.filter(filterFn)
        }
    }, [selectedMonth, procurementData, logisticsData, operatingData])

    // Calculate Totals
    const totals = useMemo(() => {
        const allFiltered = [
            ...filteredData.procurement,
            ...filteredData.logistics,
            ...filteredData.operating
        ]

        return {
            rmb: allFiltered.reduce((sum, r) => sum + (r.amountRMB || 0), 0),
            usd: allFiltered.reduce((sum, r) => sum + (r.amountUSD || 0), 0)
        }
    }, [filteredData])

    // Calculate Person Aggregates
    const personStats = useMemo(() => {
        const stats = new Map<string, { rmb: number, usd: number }>()

        const processRecord = (r: ExpenseRecord) => {
            const name = r.person || 'Unknown'
            const current = stats.get(name) || { rmb: 0, usd: 0 }
            stats.set(name, {
                rmb: current.rmb + (r.amountRMB || 0),
                usd: current.usd + (r.amountUSD || 0)
            })
        }

        filteredData.procurement.forEach(processRecord)
        filteredData.logistics.forEach(processRecord)
        filteredData.operating.forEach(processRecord)

        return Array.from(stats.entries()).map(([name, values]) => ({ name, ...values }))
    }, [filteredData])


    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Select Month:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableMonths.length > 0 ? (
                            availableMonths.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))
                        ) : (
                            <SelectItem value={format(new Date(), 'yyyy-MM')}>{format(new Date(), 'yyyy-MM')}</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Monthly Expenses (RMB)</CardTitle>
                        <div className="text-muted-foreground font-bold">¥</div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">¥{formatNumber(totals.rmb)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Monthly Expenses (USD)</CardTitle>
                        <div className="text-muted-foreground font-bold">$</div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${formatNumber(totals.usd)}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-medium">Spending by Person (Selected Month)</h3>
                <div className="rounded-md border bg-white">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Person</TableHead>
                                <TableHead>Total Spent (RMB)</TableHead>
                                <TableHead>Total Spent (USD)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {personStats.length > 0 ? (
                                personStats.map((person) => (
                                    <TableRow key={person.name}>
                                        <TableCell className="font-medium">{person.name}</TableCell>
                                        <TableCell>¥{formatNumber(person.rmb)}</TableCell>
                                        <TableCell>${formatNumber(person.usd)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">No data for this month.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
