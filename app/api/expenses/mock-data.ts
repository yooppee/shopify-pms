import { ExpenseRecord } from "@/components/expenses/generic-expense-table";

export const procurementData: ExpenseRecord[] = [
    {
        id: "1",
        date: new Date("2024-01-15"),
        item: "Raw Materials Batch A",
        amountRMB: 5000,
        amountUSD: 700,
        person: "John Doe"
    },
    {
        id: "2",
        date: new Date("2024-01-20"),
        item: "Packaging Supplies",
        amountRMB: 1200,
        amountUSD: 168,
        person: "Jane Smith"
    },
    {
        id: "3",
        date: new Date("2024-02-05"),
        item: "Factory Equipment Maintenance",
        amountRMB: 800,
        amountUSD: 112,
        person: "John Doe"
    }
];

export const logisticsData: ExpenseRecord[] = [
    {
        id: "1",
        date: new Date("2024-01-18"),
        item: "Shipping to US Warehouse",
        amountRMB: 3500,
        amountUSD: 490,
        person: "Mike Brown"
    },
    {
        id: "2",
        date: new Date("2024-02-01"),
        item: "Local Delivery Service",
        amountRMB: 500,
        amountUSD: 70,
        person: "Mike Brown"
    }
];

export const operatingData: ExpenseRecord[] = [
    {
        id: "1",
        date: new Date("2024-01-01"),
        item: "Shopify Subscription",
        amountRMB: 2100,
        amountUSD: 299,
        person: "Admin"
    },
    {
        id: "2",
        date: new Date("2024-01-10"),
        item: "Marketing Ads (FB)",
        amountRMB: 15000,
        amountUSD: 2100,
        person: "Sarah Lee"
    }
];
