// TypeScript types for database tables

export interface Product {
    id: string
    variant_id: number
    shopify_product_id: number
    title: string
    handle: string
    sku: string | null
    price: number
    compare_at_price: number | null
    inventory_quantity: number
    weight: number | null
    image_url: string | null
    landing_page_url: string | null
    position: number | null
    internal_meta: InternalMeta
    created_at: string
    updated_at: string
}

export interface InternalMeta {
    cost_price?: number
    vendor?: string // Vendor/supplier name
    purchase_link?: string // Vendor purchase link
    profit_margin?: number
    notes?: string
    manual_inventory?: number // For manual inventory override
    inventory_updated_at?: string // Timestamp of last manual inventory update
    [key: string]: any // Allow custom fields
}

export interface ListingDraftData {
    title?: string
    sku?: string
    price?: number
    compare_at_price?: number | null
    cost?: number | null
    weight?: number | null
    vendor?: string
    note?: string
    purchase_link?: string
    options?: any[]
    variants?: any[]
    is_pushed?: boolean
    shopify_product_id?: string
}

export interface ListingDraft {
    id: string
    product_id: string | null
    original_data: any
    draft_data: ListingDraftData
    status: 'draft' | 'ready'
    created_at: string
    updated_at: string
}

export interface UserEvent {
    id: string
    session_id: string
    product_variant_id: number
    event_type: 'view' | 'cart' | 'purchase'
    event_data: any
    created_at: string
}

export interface ProductRecommendation {
    variant_id: number
    view_count: number
    product_title: string | null
    product_image_url: string | null
    product_price: number | null
}

// Supabase Database type
export interface Database {
    public: {
        Tables: {
            products: {
                Row: Product
                Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { created_at?: string }
                Update: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at'>> & { created_at?: string }
            }
            listing_drafts: {
                Row: ListingDraft
                Insert: Omit<ListingDraft, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<ListingDraft, 'id' | 'created_at' | 'updated_at'>>
            }
            user_events: {
                Row: UserEvent
                Insert: Omit<UserEvent, 'id' | 'created_at'>
                Update: Partial<Omit<UserEvent, 'id' | 'created_at'>>
            }
        }
        Functions: {
            get_product_recommendations: {
                Args: {
                    target_variant_id: number
                    limit_count?: number
                }
                Returns: ProductRecommendation[]
            }
        }
    }
}

// Enhanced Product type with calculated fields for UI
export interface ProductWithCalculations extends Product {
    gross_profit?: number
    live_price?: number
    live_inventory?: number
    has_changes?: boolean
    order_count?: number
}
