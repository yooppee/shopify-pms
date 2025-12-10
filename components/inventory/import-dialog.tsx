import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, Download, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface ImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function ImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
    const [file, setFile] = useState<File | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [result, setResult] = useState<{ count: number, errors?: string[], total: number } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDownloadTemplate = () => {
        window.open('/api/excel/template', '_blank')
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
            setResult(null) // Reset previous results
        }
    }

    const handleUpload = async () => {
        if (!file) return

        setIsUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const response = await fetch('/api/excel/import', {
                method: 'POST',
                body: formData,
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Import failed')
            }

            setResult({
                count: data.count,
                errors: data.errors,
                total: data.totalRows || 0
            })

            if (data.count > 0) {
                toast.success(`Successfully updated ${data.count} products`)
                onSuccess()
            } else if (data.errors?.length > 0) {
                toast.error('Import completed with errors')
            } else {
                toast('No updates found')
            }

        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error(error.message)
        } finally {
            setIsUploading(false)
        }
    }

    const resetDialog = () => {
        setFile(null)
        setResult(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) resetDialog()
            onOpenChange(val)
        }}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Import Inventory Data</DialogTitle>
                    <DialogDescription>
                        Update cost, supplier, notes, and other internal data using an Excel file.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Step 1: Download Template */}
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/20">
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium">1. Download Template</h4>
                            <p className="text-xs text-muted-foreground">
                                Get the latest product list format
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                        </Button>
                    </div>

                    {/* Step 2: Upload File */}
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <h4 className="text-sm font-medium">2. Upload Updated File</h4>
                            <p className="text-xs text-muted-foreground">
                                Select the modified Excel file to import
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx, .xls"
                                onChange={handleFileChange}
                                className="cursor-pointer"
                                disabled={isUploading}
                            />
                        </div>
                    </div>

                    {/* Results Display */}
                    {result && (
                        <div className={`p-4 rounded-lg text-sm border ${result.errors && result.errors.length > 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-green-500/10 border-green-500/20'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                {result.errors && result.errors.length > 0 ? (
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                )}
                                <span className="font-medium">
                                    Processed {result.total} records
                                </span>
                            </div>
                            <div className="space-y-1 text-xs">
                                <p>Successfully updated: <span className="font-bold">{result.count}</span></p>
                                {result.errors && result.errors.length > 0 && (
                                    <div className="mt-2">
                                        <p className="font-semibold text-destructive mb-1">Errors ({result.errors.length}):</p>
                                        <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto text-muted-foreground">
                                            {result.errors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
                        Cancel
                    </Button>
                    <Button onClick={handleUpload} disabled={!file || isUploading}>
                        {isUploading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Import Data
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
