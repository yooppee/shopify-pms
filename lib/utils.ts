import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Format currency values
 */
export function formatCurrency(value: number | null | undefined): string {
    if (value == null) return '-'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value)
}

/**
 * Format numbers with commas
 */
export function formatNumber(value: number | null | undefined): string {
    if (value == null) return '-'
    return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Calculate gross profit
 */
export function calculateGrossProfit(
    price: number,
    costPrice?: number
): number | null {
    if (!costPrice) return null
    return price - costPrice
}

/**
 * Calculate profit margin percentage
 */
export function calculateProfitMargin(
    price: number,
    costPrice?: number
): number | null {
    const profit = calculateGrossProfit(price, costPrice)
    if (profit === null || price === 0) return null
    return (profit / price) * 100
}
