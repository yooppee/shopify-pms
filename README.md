# Shopify PMS - E-commerce Product Management System

A comprehensive web-based system to manage e-commerce product data, optimize listings, and track product recommendations. Built with Next.js 14+, Supabase, and TailwindCSS.

## Features

- **Smart Inventory System**: Sync Shopify products and manage internal metadata
- **Dual Data Source**: Combine external Shopify data with internal cost tracking
- **Excel-like Interface**: TanStack Table with sticky columns and editable cells
- **Live Data Comparison**: Visual diff highlighting for Shopify vs. database values
- **Analytics Tracking**: Track user events and product recommendations
- **SaaS-style UI**: Modern, professional interface with Shadcn/UI components

## Tech Stack

- **Framework**: Next.js 14+ (App Router, TypeScript)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **UI Library**: Tailwind CSS + Shadcn/UI
- **State Management**: TanStack Query (React Query)
- **Data Grid**: TanStack Table v8
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project
- Access to Shopify products.json endpoint

### Installation

1. **Clone the repository**:
   ```bash
   cd "c:\Shopify PMS"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Supabase**:
   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Run the schema from `supabase/schema.sql` in your Supabase SQL Editor
   - Get your project URL and anon key from Project Settings > API

4. **Configure environment variables**:
   - Copy `.env.local.example` to `.env.local`
   - Add your Supabase credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     NEXT_PUBLIC_SHOPIFY_PRODUCTS_URL=https://yooppee.com/products.json
     ```

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

### Initial Setup

1. **Sync Shopify Products**:
   - Go to the Inventory page
   - Click "Sync from Shopify" to import products into your database

2. **Manage Internal Data**:
   - Click on any cell in the Cost, Logistics, Supplier, or Notes columns to edit
   - Changes auto-save to the database

3. **Compare Live Data**:
   - Click "Fetch Live Data" to compare database values with current Shopify data
   - Differences are highlighted in amber/orange

4. **Column Visibility**:
   - Click the "Columns" dropdown to show/hide columns
   - Your preferences are saved to localStorage

## Project Structure

```
c:\Shopify PMS\
├── app/
│   ├── api/
│   │   ├── sync/          # Shopify sync endpoint
│   │   └── track/         # Analytics tracking
│   ├── inventory/         # Inventory management page
│   ├── listings/          # Listing optimizer (placeholder)
│   ├── analytics/         # Analytics dashboard (placeholder)
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Landing page
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # Shadcn/UI components
│   ├── inventory/         # Inventory-specific components
│   └── layout/            # Layout components
├── lib/
│   ├── supabase/          # Supabase client & types
│   ├── shopify.ts         # Shopify data parser
│   └── utils.ts           # Utility functions
└── supabase/
    └── schema.sql         # Database schema
```

## Database Schema

### Tables

- **products**: Core inventory with dual data source (Shopify + internal JSONB)
- **listing_drafts**: Workflow for optimizing listings
- **user_events**: Analytics tracking

### Key Features

- JSONB for flexible internal metadata
- RPC function for product recommendations
- Row Level Security (RLS) policies
- Auto-updating timestamps

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository to Vercel
3. Add environment variables in Vercel project settings
4. Deploy!

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
