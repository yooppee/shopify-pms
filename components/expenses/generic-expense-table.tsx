"use client"

import * as React from "react"
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    SortingState,
    getSortedRowModel,
} from "@tanstack/react-table"
import { CalendarIcon, Plus, Trash2, Search as SearchIcon, Filter, RotateCcw } from "lucide-react"
import { format, subDays, isWithinInterval } from "date-fns"
import { DateRange } from "react-day-picker"

import { cn, formatNumber, formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { EditableCell } from "./editable-cell"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export type ExpenseRecord = {
    id: string
    date: Date
    item: string
    amountRMB: number
    amountUSD: number
    person: string
}

interface GenericExpenseTableProps {
    data: ExpenseRecord[]
    onDataChange?: (data: ExpenseRecord[]) => void
}

export function GenericExpenseTable({ data: initialData, onDataChange }: GenericExpenseTableProps) {
    const [sorting, setSorting] = React.useState<SortingState>([])
    const [data, setData] = React.useState<ExpenseRecord[]>(initialData)

    // Sync with parent state changes if initialData updates (e.g. from a fresh fetch or parent reset)
    // Note: This needs care to avoid loops if onDataChange triggers parent to update initialData immediately
    // but React usually handles this well if references are stable. 
    // However, for simple "lifted state", we might want to just rely on initialData being the seed
    // OR treating it as fully controlled. 
    // For now, let's just allow internal updates to bubble up.

    React.useEffect(() => {
        setData(initialData)
    }, [initialData])

    const updateParent = (newData: ExpenseRecord[]) => {
        if (onDataChange) {
            onDataChange(newData)
        }
    }

    const [isDeleteMode, setIsDeleteMode] = React.useState(false)
    const [pendingDeletions, setPendingDeletions] = React.useState<Set<string>>(new Set())

    const [searchTerm, setSearchTerm] = React.useState('')
    const [statsColumn, setStatsColumn] = React.useState<string>('amountRMB')
    const [statsType, setStatsType] = React.useState<'sum' | 'avg'>('sum')
    const [statsDateRange, setStatsDateRange] = React.useState<DateRange | undefined>(undefined)
    const [tempStatsDateRange, setTempStatsDateRange] = React.useState<DateRange | undefined>(undefined)
    const [isStatsDatePickerOpen, setIsStatsDatePickerOpen] = React.useState(false)

    // Sync temp date range when main range changes
    React.useEffect(() => {
        setTempStatsDateRange(statsDateRange)
    }, [statsDateRange])

    const filteredData = React.useMemo(() => {
        let result = data

        // 1. Search Filter
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase()
            result = result.filter(record =>
                record.item.toLowerCase().includes(lowerTerm)
            )
        }

        // 2. Date Filter
        if (statsDateRange?.from) {
            result = result.filter(record => {
                if (!record.date) return false
                const date = new Date(record.date)
                if (statsDateRange.to) {
                    return isWithinInterval(date, { start: statsDateRange.from!, end: statsDateRange.to })
                }
                return date >= statsDateRange.from!
            })
        }
        return result
    }, [data, searchTerm, statsDateRange])

    const statsValue = React.useMemo(() => {
        if (filteredData.length === 0) return 0

        const total = filteredData.reduce((sum, record) => {
            let val = 0
            switch (statsColumn) {
                case 'amountRMB': val = record.amountRMB; break;
                case 'amountUSD': val = record.amountUSD; break;
                default: val = 0
            }
            return sum + (isNaN(val) ? 0 : val)
        }, 0)

        return statsType === 'avg' ? (total / filteredData.length) : total
    }, [filteredData, statsColumn, statsType])

    const updateData = (rowIndex: number, columnId: string, value: any) => {
        setData((old) => {
            const newData = old.map((row, index) => {
                if (index === rowIndex) {
                    return {
                        ...old[rowIndex]!,
                        [columnId]: value,
                    }
                }
                return row
            })
            updateParent(newData)
            return newData
        })
    }

    const handleDeleteToggle = (id: string) => {
        setPendingDeletions((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleDeleteAllToggle = () => {
        // If all visible rows are selected, deselect all. Otherwise select all.
        const allSelected = data.length > 0 && data.every(row => pendingDeletions.has(row.id))

        if (allSelected) {
            setPendingDeletions(new Set())
        } else {
            const allIds = new Set(data.map(r => r.id))
            setPendingDeletions(allIds)
        }
    }

    const handleConfirmDelete = () => {
        setData(prev => {
            const newData = prev.filter(row => !pendingDeletions.has(row.id))
            updateParent(newData)
            return newData
        })
        setPendingDeletions(new Set())
        setIsDeleteMode(false)
    }

    const columns: ColumnDef<ExpenseRecord>[] = React.useMemo(() => [
        ...(isDeleteMode ? [{
            id: 'delete',
            header: () => {
                const allSelected = data.length > 0 && data.every(row => pendingDeletions.has(row.id))
                return (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleDeleteAllToggle}
                            aria-label="Select all"
                        />
                    </div>
                )
            },
            cell: ({ row }) => (
                <div className="flex items-center justify-center">
                    <button
                        onClick={() => handleDeleteToggle(row.original.id)}
                        className="p-1 hover:bg-destructive/10 rounded group"
                    >
                        <Trash2
                            className={cn(
                                "h-4 w-4",
                                pendingDeletions.has(row.original.id) ? "text-destructive" : "text-muted-foreground group-hover:text-destructive"
                            )}
                        />
                    </button>
                </div>
            ),
            size: 40,
        } as ColumnDef<ExpenseRecord>] : []),
        {
            accessorKey: "date",
            header: "日期",
            cell: ({ row }) => {
                const date = row.getValue("date") as Date
                return (
                    <div className="flex items-center">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"ghost"}
                                    className={cn(
                                        "w-[240px] justify-start text-left font-normal pl-3",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(newDate) => {
                                        if (newDate) {
                                            updateData(row.index, "date", newDate)
                                        }
                                    }}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                )
            },
        },
        {
            accessorKey: "item",
            header: "支出项目",
            cell: ({ row, column }) => {
                const value = row.getValue("item")
                return (
                    <EditableCell
                        value={value}
                        onCommit={(newValue) => updateData(row.index, column.id, newValue)}
                    />
                )
            },
        },
        {
            accessorKey: "amountRMB",
            header: "支出金额(RMB)",
            cell: ({ row, column }) => {
                const value = row.getValue("amountRMB")
                return (
                    <EditableCell
                        value={value}
                        format="currency"
                        prefix="¥"
                        onCommit={(newValue) => updateData(row.index, column.id, newValue)}
                    />
                )
            },
        },
        {
            accessorKey: "amountUSD",
            header: "支出金额(USD)",
            cell: ({ row, column }) => {
                const value = row.getValue("amountUSD")
                return (
                    <EditableCell
                        value={value}
                        format="currency"
                        prefix="$"
                        onCommit={(newValue) => updateData(row.index, column.id, newValue)}
                    />
                )
            },
        },
        {
            accessorKey: "person",
            header: "负责人",
            cell: ({ row, column }) => {
                const value = row.getValue("person")
                return (
                    <EditableCell
                        value={value}
                        onCommit={(newValue) => updateData(row.index, column.id, newValue)}
                    />
                )
            },
        },
    ], [isDeleteMode, pendingDeletions, data])

    const addRow = () => {
        const newRecord: ExpenseRecord = {
            id: crypto.randomUUID(),
            date: new Date(),
            item: "",
            amountRMB: 0,
            amountUSD: 0,
            person: "",
        }
        setData((old) => {
            const newData = [...old, newRecord]
            updateParent(newData)
            return newData
        })
    }

    const table = useReactTable({
        data: filteredData,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        state: {
            sorting,
        },
    })

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:items-center">
                <div className="flex items-center gap-2">
                    <SearchIcon className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by expense item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm"
                    />
                </div>

                {/* Statistics Dashboard */}
                <div className="flex justify-center">
                    <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg border w-fit">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Stats:</span>

                            <Select value={statsColumn} onValueChange={setStatsColumn}>
                                <SelectTrigger className="h-8 w-[130px] text-xs bg-background">
                                    <SelectValue placeholder="Column" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="amountRMB">Amount (RMB)</SelectItem>
                                    <SelectItem value="amountUSD">Amount (USD)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statsType} onValueChange={(val: any) => setStatsType(val)}>
                                <SelectTrigger className="h-8 w-[90px] text-xs bg-background">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sum">Sum</SelectItem>
                                    <SelectItem value="avg">Average</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Date Filter for Stats */}
                            <Popover open={isStatsDatePickerOpen} onOpenChange={setIsStatsDatePickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            "h-8 justify-start text-left font-normal text-xs bg-background",
                                            !statsDateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-3 w-3" />
                                        {statsDateRange?.from ? (
                                            statsDateRange.to ? (
                                                <>
                                                    {format(statsDateRange.from, "LLL dd, y")} -{" "}
                                                    {format(statsDateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(statsDateRange.from, "LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <div className="flex">
                                        <div className="flex flex-col border-r py-2 min-w-[140px]">
                                            {[
                                                { label: 'Today', days: 0 },
                                                { label: 'Yesterday', days: 1, offset: true },
                                                { label: 'Last 7 days', days: 7 },
                                                { label: 'Last 30 days', days: 30 },
                                                { label: 'Last 90 days', days: 90 },
                                                { label: 'Last 365 days', days: 365 },
                                            ].map((preset) => (
                                                <button
                                                    key={preset.label}
                                                    className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors"
                                                    onClick={() => {
                                                        const today = new Date()
                                                        today.setHours(0, 0, 0, 0)
                                                        let from: Date, to: Date
                                                        if (preset.offset) {
                                                            from = subDays(today, preset.days)
                                                            to = subDays(today, preset.days)
                                                        } else if (preset.days === 0) {
                                                            from = today; to = today;
                                                        } else {
                                                            from = subDays(today, preset.days)
                                                            to = today
                                                        }
                                                        setTempStatsDateRange({ from, to })
                                                    }}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                            <div className="border-t my-1"></div>
                                            <button
                                                className="px-4 py-2 text-sm text-left hover:bg-accent transition-colors text-red-500"
                                                onClick={() => {
                                                    setStatsDateRange(undefined)
                                                    setTempStatsDateRange(undefined)
                                                    setIsStatsDatePickerOpen(false)
                                                }}
                                            >
                                                Clear Filter
                                            </button>
                                        </div>
                                        <div className="flex flex-col">
                                            <Calendar
                                                mode="range"
                                                defaultMonth={tempStatsDateRange?.from}
                                                selected={tempStatsDateRange}
                                                onSelect={setTempStatsDateRange}
                                                numberOfMonths={2}
                                                className="p-3"
                                            />
                                            <div className="flex items-center justify-end gap-2 p-3 border-t bg-muted/10">
                                                <Button variant="ghost" size="sm" onClick={() => setIsStatsDatePickerOpen(false)}>Cancel</Button>
                                                <Button size="sm" onClick={() => {
                                                    setStatsDateRange(tempStatsDateRange)
                                                    setIsStatsDatePickerOpen(false)
                                                }}>Apply</Button>
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                        </div>

                        <div className="h-8 w-px bg-border mx-1"></div>

                        <div className="flex items-center px-3 h-8 bg-background rounded border min-w-[100px] justify-center">
                            <span className="font-mono font-bold text-sm text-primary">
                                {statsColumn === 'amountRMB' ? '¥' : '$'}{formatNumber(statsValue)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    {isDeleteMode ? (
                        <>
                            <Button
                                onClick={handleConfirmDelete}
                                variant="destructive"
                                size="sm"
                                className="h-8"
                                disabled={pendingDeletions.size === 0}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Confirm Delete ({pendingDeletions.size})
                            </Button>
                            <Button
                                onClick={() => {
                                    setIsDeleteMode(false)
                                    setPendingDeletions(new Set())
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-8"
                            >
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button
                            onClick={() => setIsDeleteMode(true)}
                            variant="outline"
                            size="sm"
                            className="h-8 border-dashed text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Rows
                        </Button>
                    )}

                    <Button onClick={addRow} variant="outline" size="sm" className="h-8 border-dashed">
                        <Plus className="mr-2 h-4 w-4" />
                        添加一行
                    </Button>
                </div>
            </div>
            <div className="rounded-md border bg-white">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    let widthClass = "w-auto"
                                    switch (header.column.id) {
                                        case 'date': widthClass = "w-[15%]"; break;
                                        case 'item': widthClass = "w-[40%]"; break;
                                        case 'amountRMB': widthClass = "w-[15%]"; break;
                                        case 'amountUSD': widthClass = "w-[15%]"; break;
                                        case 'person': widthClass = "w-[15%]"; break;
                                        case 'delete': widthClass = "w-[50px]"; break;
                                    }
                                    return (
                                        <TableHead key={header.id} className={widthClass}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={cn(
                                        pendingDeletions.has(row.original.id) && "bg-destructive/10 hover:bg-destructive/20"
                                    )}
                                >
                                    {row.getVisibleCells().map((cell) => {
                                        let widthClass = "w-auto"
                                        switch (cell.column.id) {
                                            case 'date': widthClass = "w-[15%]"; break;
                                            case 'item': widthClass = "w-[40%]"; break;
                                            case 'amountRMB': widthClass = "w-[15%]"; break;
                                            case 'amountUSD': widthClass = "w-[15%]"; break;
                                            case 'person': widthClass = "w-[15%]"; break;
                                            case 'delete': widthClass = "w-[50px]"; break;
                                        }
                                        return (
                                            <TableCell key={cell.id} className={cn(
                                                pendingDeletions.has(row.original.id) && "opacity-50 line-through grayscale",
                                                widthClass,
                                                "py-3"
                                            )}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        )
                                    })}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
