"use client"

import * as React from "react"
import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,

    SortingState,
    getSortedRowModel,
    ExpandedState,
    getExpandedRowModel,
} from "@tanstack/react-table"
import { Trash2, Plus, Search as SearchIcon, Calendar as CalendarIcon, Save, Loader2, Filter, RotateCcw, Layers, ChevronRight, ChevronDown, FolderOpen, Folder, Minimize2 } from "lucide-react"
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

const flattenExpenses = (nodes: ExpenseRecord[]): ExpenseRecord[] => {
    let flat: ExpenseRecord[] = []
    for (const node of nodes) {
        if (node.isGroup && node.children) {
            flat = flat.concat(flattenExpenses(node.children))
        } else {
            flat.push(node)
        }
    }
    return flat
}

export type ExpenseRecord = {
    id: string
    date: Date
    item: string
    amountRMB: number
    amountUSD: number
    person: string
    children?: ExpenseRecord[]
    isGroup?: boolean
    parentId?: string | null
    lastModified?: Date | null
    lastModifiedColumn?: string
    isNew?: boolean
}

interface GenericExpenseTableProps {
    data: ExpenseRecord[]
    onDataChange?: (data: ExpenseRecord[]) => void
    onSave?: () => void
    onDiscard?: () => void
    isSaving?: boolean
    unsavedCount?: number
}

export function GenericExpenseTable({ data: initialData, onDataChange, onSave, isSaving, unsavedCount, onDiscard }: GenericExpenseTableProps) {
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



    const [isGroupMode, setIsGroupMode] = React.useState(false)
    const [selectedForGroup, setSelectedForGroup] = React.useState<Set<string>>(new Set())
    const [expanded, setExpanded] = React.useState<ExpandedState>({})

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
        const lowerTerm = searchTerm.toLowerCase()
        const checkDate = (date?: Date) => {
            if (!statsDateRange?.from || !date) return true
            const d = new Date(date)
            if (statsDateRange.to) {
                const endDate = new Date(statsDateRange.to)
                endDate.setHours(23, 59, 59, 999)
                return isWithinInterval(d, { start: statsDateRange.from, end: endDate })
            }
            return d >= statsDateRange.from
        }

        const filterNode = (node: ExpenseRecord): ExpenseRecord | null => {
            // Leaf node check
            if (!node.isGroup) {
                const matchesSearch = !searchTerm || node.item.toLowerCase().includes(lowerTerm)
                const matchesDate = !statsDateRange?.from || checkDate(node.date)
                return (matchesSearch && matchesDate) ? node : null
            }

            // Group node: check children
            let filteredChildren: ExpenseRecord[] = []
            if (node.children) {
                filteredChildren = node.children.map(filterNode).filter(Boolean) as ExpenseRecord[]
            }

            if (filteredChildren.length > 0) {
                return { ...node, children: filteredChildren }
            }
            return null
        }

        return data.map(filterNode).filter(Boolean) as ExpenseRecord[]
    }, [data, searchTerm, statsDateRange])

    const statsValue = React.useMemo(() => {
        const flatData = flattenExpenses(filteredData)
        if (flatData.length === 0) return 0

        const total = flatData.reduce((sum, record) => {
            let val = 0
            switch (statsColumn) {
                case 'amountRMB': val = record.amountRMB; break;
                case 'amountUSD': val = record.amountUSD; break;
                default: val = 0
            }
            return sum + (isNaN(val) ? 0 : val)
        }, 0)

        return statsType === 'avg' ? (total / flatData.length) : total
    }, [filteredData, statsColumn, statsType])

    const updateData = (id: string, columnId: string, value: any) => {
        const updateRecursive = (nodes: ExpenseRecord[]): ExpenseRecord[] => {
            return nodes.map(node => {
                if (node.id === id) {
                    // Logic for new rows: do not track modification if it's new
                    if (node.isNew) {
                        return { ...node, [columnId]: value }
                    }

                    // Logic for multiple columns
                    // Logic for multiple columns accumulation
                    let newLastModifiedColumn = columnId
                    if (node.lastModified) {
                        const timeDiff = new Date().getTime() - new Date(node.lastModified).getTime()
                        // If modified within last 1 minute
                        if (timeDiff < 60000 && node.lastModifiedColumn) {
                            const existingColumns = node.lastModifiedColumn.split(',')
                            if (!existingColumns.includes(columnId)) {
                                newLastModifiedColumn = [...existingColumns, columnId].join(',')
                            } else {
                                newLastModifiedColumn = node.lastModifiedColumn
                            }
                        }
                    }

                    return {
                        ...node,
                        [columnId]: value,
                        lastModified: new Date(),
                        lastModifiedColumn: newLastModifiedColumn
                    }
                }
                if (node.children) {
                    return { ...node, children: updateRecursive(node.children) }
                }
                return node
            })
        }

        setData((old) => {
            const newData = updateRecursive(old)
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

    const handleGroupToggle = (id: string) => {
        setSelectedForGroup((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleConfirmGroup = () => {
        if (selectedForGroup.size === 0) return

        const parentId = crypto.randomUUID()
        const children = data.filter(row => selectedForGroup.has(row.id))
        const remaining = data.filter(row => !selectedForGroup.has(row.id))

        // Create parent record
        const firstChild = children[0]
        const parentRecord: ExpenseRecord = {
            id: parentId,
            date: firstChild?.date || new Date(),
            item: "New Group",
            amountRMB: 0,
            amountUSD: 0,
            person: "",
            isGroup: true,
            children: children.map(c => ({ ...c, parentId }))
        }

        const newData = [parentRecord, ...remaining]

        setData(newData)
        updateParent(newData)
        setSelectedForGroup(new Set())
        setIsGroupMode(false)
        // Auto-expand the new group
        setExpanded(prev => ({ ...prev, [parentId]: true }))
    }

    const handleUngroup = (group: ExpenseRecord) => {
        if (!group.children) return

        const children = group.children.map(c => ({ ...c, parentId: null }))
        const newData = data.filter(r => r.id !== group.id).concat(children)

        setData(newData)
        updateParent(newData)
    }

    const handleGroupSelectAllToggle = () => {
        const eligibleRows = data.filter(row => !row.isGroup && !row.parentId)
        const allSelected = eligibleRows.length > 0 && eligibleRows.every(row => selectedForGroup.has(row.id))

        if (allSelected) {
            setSelectedForGroup(new Set())
        } else {
            const allIds = new Set(eligibleRows.map(r => r.id))
            setSelectedForGroup(allIds)
        }
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
        ...(isGroupMode ? [{
            id: 'group-select',
            header: () => {
                // Determine if all ELIGIBLE rows are selected
                const eligibleRows = data.filter(row => !row.isGroup && !row.parentId)
                const allSelected = eligibleRows.length > 0 && eligibleRows.every(row => selectedForGroup.has(row.id))

                return (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleGroupSelectAllToggle}
                            aria-label="Select all for grouping"
                        />
                    </div>
                )
            },
            cell: ({ row }) => {
                // Only allow selecting top-level non-group items for now? 
                // Or allow nesting groups? Let's keep it simple: only top-level items can be grouped (for now).
                // Actually if row.depth > 0 it's a child.
                if (row.depth > 0 || row.original.isGroup) return null

                return (
                    <div className="flex items-center justify-center">
                        <Checkbox
                            checked={selectedForGroup.has(row.original.id)}
                            onCheckedChange={() => handleGroupToggle(row.original.id)}
                        />
                    </div>
                )
            },
            size: 40,
        } as ColumnDef<ExpenseRecord>] : []),
        {
            accessorKey: "date",
            header: "日期",
            cell: ({ row }) => {
                // If group row, allow expanding?
                if (row.original.isGroup) {
                    return (
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={row.getToggleExpandedHandler()}
                            >
                                {row.getIsExpanded() ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    )
                }

                const date = row.getValue("date") as Date
                return (
                    <div className="flex flex-col items-start justify-center pl-8"> {/* Stack vertically */}
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
                                            updateData(row.original.id, "date", newDate)
                                        }
                                    }}
                                    disabled={(date) => date > new Date()}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                        {row.original.lastModified && (
                            <div className="text-[10px] text-muted-foreground mt-1 pl-3">
                                Updated {format(new Date(row.original.lastModified), "MM/dd HH:mm")}
                                {row.original.lastModifiedColumn && ` (${row.original.lastModifiedColumn.split(',').map(col =>
                                    col === 'amountRMB' ? 'RMB' :
                                        col === 'amountUSD' ? 'USD' :
                                            col === 'item' ? 'Item' :
                                                col === 'person' ? 'Person' :
                                                    col === 'date' ? 'Date' :
                                                        col
                                ).join(', ')
                                    })`}
                            </div>
                        )}
                    </div>
                )
            },
        },
        {
            accessorKey: "item",
            header: "支出项目",
            cell: ({ row }) => {
                // Indentation logic
                const paddingLeft = `${row.depth * 2}rem`

                if (row.original.isGroup) {
                    return (
                        <div style={{ paddingLeft }} className="flex items-center gap-2">
                            <Folder className="h-4 w-4 text-blue-500" />
                            <EditableCell
                                value={row.getValue("item")}
                                onCommit={(value) => updateData(row.original.id, "item", value)}
                                className="font-bold"
                            />
                        </div>
                    )
                }

                return (
                    <div style={{ paddingLeft }}>
                        <EditableCell
                            value={row.getValue("item")}
                            onCommit={(value) => updateData(row.original.id, "item", value)}
                        />
                    </div>
                )
            },
        },
        {
            accessorKey: "amountRMB",
            header: "支出金额(RMB)",
            cell: ({ row }) => {
                if (row.original.isGroup) {
                    const total = flattenExpenses(row.original.children || []).reduce((sum, r) => sum + (r.amountRMB || 0), 0)
                    return <span className="font-semibold text-muted-foreground">¥{formatNumber(total)}</span>
                }
                return (
                    <EditableCell
                        value={row.getValue("amountRMB")}
                        onCommit={(value) => updateData(row.original.id, "amountRMB", Number(value))}
                        format="currency"
                        prefix="¥"
                    />
                )
            },
        },
        {
            accessorKey: "amountUSD",
            header: "支出金额(USD)",
            cell: ({ row }) => {
                if (row.original.isGroup) {
                    const total = flattenExpenses(row.original.children || []).reduce((sum, r) => sum + (r.amountUSD || 0), 0)
                    return <span className="font-semibold text-muted-foreground">${formatNumber(total)}</span>
                }
                return (
                    <EditableCell
                        value={row.getValue("amountUSD")}
                        onCommit={(value) => updateData(row.original.id, "amountUSD", Number(value))}
                        format="currency"
                        prefix="$"
                    />
                )
            },
        },
        {
            accessorKey: "person",
            header: "负责人",
            cell: ({ row }) => {
                if (row.original.isGroup) return (
                    <div className="flex items-end justify-end w-full">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUngroup(row.original)}
                            className="h-6 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Ungroup"
                        >
                            <Minimize2 className="h-3 w-3 mr-1" />
                            Ungroup
                        </Button>
                    </div>
                )
                return (
                    <EditableCell
                        value={row.getValue("person")}
                        onCommit={(value) => updateData(row.original.id, "person", value)}
                    />
                )
            },
        },
    ] as ColumnDef<ExpenseRecord>[], [data, isDeleteMode, pendingDeletions, isGroupMode, selectedForGroup])

    const addRow = () => {
        const newRecord: ExpenseRecord = {
            id: crypto.randomUUID(),
            date: new Date(),
            item: "",
            amountRMB: 0,
            amountUSD: 0,
            amountUSD: 0,
            person: "",
            isNew: true,
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
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        onSortingChange: setSorting,
        onExpandedChange: setExpanded,
        getSubRows: (row) => row.children,
        state: {
            sorting,
            expanded,
        },
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by expense item..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 w-[250px]"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Stats Dashboard */}
                    <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-lg border">
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
                    {isGroupMode ? (
                        <>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setIsGroupMode(false)}
                                className="gap-2 h-8"
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="default" // Primary color
                                size="sm"
                                onClick={handleConfirmGroup}
                                disabled={selectedForGroup.size === 0}
                                className="gap-2 h-8"
                            >
                                <Layers className="h-4 w-4" />
                                Confirm Group
                            </Button>
                        </>
                    ) : (
                        isDeleteMode ? (
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
                            <>
                                <Button
                                    onClick={() => setIsDeleteMode(true)}
                                    variant="outline"
                                    size="sm"
                                    className="h-8 border-dashed text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Rows
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-8 border-dashed"
                                    onClick={() => setIsGroupMode(true)}
                                >
                                    <Layers className="h-4 w-4" />
                                    Group Rows
                                </Button>
                            </>
                        )
                    )}

                    <Button onClick={addRow} variant="outline" size="sm" className="h-8 border-dashed">
                        <Plus className="mr-2 h-4 w-4" />
                        添加一行
                    </Button>

                    {onSave && (
                        <div className="relative">
                            {onDiscard && unsavedCount ? (
                                <Button
                                    onClick={onDiscard}
                                    variant="ghost"
                                    size="sm"
                                    className="absolute -top-8 right-0 h-6 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                >
                                    Discard Changes
                                </Button>
                            ) : null}
                            <Button
                                onClick={onSave}
                                disabled={isSaving || !unsavedCount}
                                variant="default"
                                size="sm"
                                className={cn(
                                    "h-8 text-white transition-all",
                                    unsavedCount
                                        ? "bg-black hover:bg-gray-800"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed hover:bg-gray-200"
                                )}
                            >
                                {isSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Changes {unsavedCount ? `(${unsavedCount})` : ''}
                            </Button>
                        </div>
                    )}
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
