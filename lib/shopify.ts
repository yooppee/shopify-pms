// Shopify Data Parser Service
// Handles fetching and transforming Shopify products.json data

// ============================================
// Strict TypeScript Interfaces for Shopify API
// ============================================

export interface ShopifyImage {
    id: number
    src: string
    position: number
    width: number
    height: number
}

export interface ShopifyVariant {
    id: number
    product_id: number
    title: string // e.g., "Red / L" or "Default Title"
    price: string // Comes as string "20.00"
    sku: string
    position: number
    inventory_quantity: number
    compare_at_price: string | null
    weight: number
    weight_unit: string
    image_id: number | null // Links to ShopifyImage
    featured_image: {
        id: number
        src: string
        position: number
        width: number
        height: number
    } | null
}


export interface ShopifyProduct {
    id: number
    title: string
    handle: string // For URL generation
    body_html: string
    vendor: string
    product_type: string
    images: ShopifyImage[]
    variants: ShopifyVariant[]
    published_at: string
    created_at: string
    updated_at: string
}

export interface ShopifyLineItem {
    id: number
    variant_id: number | null
    product_id: number | null
    title: string
    quantity: number
    sku: string | null
    price: string
    variant_title: string
    total_discount: string
}

export interface ShopifyOrder {
    id: number
    name: string // Order number e.g. #1001
    email: string
    financial_status: string
    fulfillment_status: string | null
    total_price: string
    subtotal_price: string
    total_tax: string
    total_discounts: string
    total_shipping_price_set: {
        shop_money: {
            amount: string
            currency_code: string
        }
    }
    currency: string
    processed_at: string
    created_at: string
    updated_at: string
    line_items: ShopifyLineItem[]
    customer?: {
        first_name: string
        last_name: string
        email: string
        default_address?: {
            address1: string
            city: string
            zip: string
            country: string
        }
    }
    shipping_address?: {
        address1: string
        city: string
        province: string
        zip: string
        country: string
        first_name: string
        last_name: string
    }
}

export interface ShopifyProductsResponse {
    products: ShopifyProduct[]
}

// ============================================
// Transformed Product for Database
// ============================================

export interface TransformedProduct {
    variant_id: number
    shopify_product_id: number
    title: string
    handle: string
    sku: string
    price: number
    compare_at_price: number | null
    inventory_quantity: number
    weight: number | null
    image_url: string | null
    landing_page_url: string
    position: number
}

// ============================================
// Shopify Data Fetcher
// ============================================

export async function fetchShopifyProducts(
    baseUrl: string = process.env.NEXT_PUBLIC_SHOPIFY_PRODUCTS_URL || 'https://yooppee.com/products.json'
): Promise<ShopifyProduct[]> {
    let allProducts: ShopifyProduct[] = []
    let page = 1
    const limit = 250 // Max limit for Shopify products.json
    let hasMore = true

    try {
        while (hasMore) {
            // Construct URL with pagination
            const url = new URL(baseUrl)
            url.searchParams.set('page', page.toString())
            url.searchParams.set('limit', limit.toString())

            console.log(`📄 Fetching page ${page} with limit ${limit}...`)
            const response = await fetch(url.toString())

            if (!response.ok) {
                throw new Error(`Failed to fetch Shopify products page ${page}: ${response.statusText}`)
            }

            const data: ShopifyProductsResponse = await response.json()
            const products = data.products

            console.log(`   ✓ Page ${page} returned ${products.length} products`)

            if (products.length === 0) {
                console.log(`   ℹ️ No products on page ${page}, stopping pagination`)
                hasMore = false
            } else {
                allProducts = [...allProducts, ...products]
                page++
                // If we got fewer products than the limit, we've reached the end
                if (products.length < limit) {
                    console.log(`   ℹ️ Received ${products.length} < ${limit} products, assuming last page`)
                    hasMore = false
                }
            }
        }

        console.log(`Total products fetched: ${allProducts.length}`)
        return allProducts
    } catch (error) {
        console.error('Error fetching Shopify products:', error)
        throw error
    }
}

/**
 * Fetch orders from Shopify Admin API
 * Requires Access Token obtained via OAuth
 */
export async function fetchShopifyOrders(
    shopDomain: string,
    accessToken: string,
    sinceId: number = 0
): Promise<ShopifyOrder[]> {
    let allOrders: ShopifyOrder[] = []
    let hasMore = true
    let lastId = sinceId

    try {
        while (hasMore) {
            const url = `https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250&since_id=${lastId}`
            console.log(`📄 Fetching orders since ID ${lastId}...`)

            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText} - ${errorText}`)
            }

            const data = await response.json()
            const orders = data.orders as ShopifyOrder[]

            if (orders.length === 0) {
                hasMore = false
            } else {
                allOrders = [...allOrders, ...orders]
                lastId = orders[orders.length - 1].id

                if (orders.length < 250) {
                    hasMore = false
                }
            }
        }

        console.log(`Total orders fetched: ${allOrders.length}`)
        return allOrders
    } catch (error) {
        console.error('Error fetching Shopify orders:', error)
        throw error
    }
}

// ============================================
// Data Transformation
// ============================================

/**
 * Transform Shopify products into variant-level records for database
 * Each variant becomes a separate product row
 */
export function transformShopifyProducts(
    shopifyProducts: ShopifyProduct[]
): TransformedProduct[] {
    const transformed: TransformedProduct[] = []

    for (const product of shopifyProducts) {
        // Create a map of image IDs to URLs for quick lookup
        const imageMap = new Map(
            product.images.map(img => [img.id, img.src])
        )

        // Use the first image as fallback
        const fallbackImage = product.images[0]?.src || null

        for (const variant of product.variants) {
            // Get the variant-specific image with priority:
            // 1. variant.featured_image.src (most specific)
            // 2. image_id mapping (fallback)
            // 3. product first image (ultimate fallback)
            let variantImageUrl = fallbackImage

            if (variant.featured_image?.src) {
                // Priority 1: Use featured_image if available
                variantImageUrl = variant.featured_image.src
            } else if (variant.image_id) {
                // Priority 2: Try image_id mapping
                const mappedImage = imageMap.get(variant.image_id)
                if (mappedImage) {
                    variantImageUrl = mappedImage
                }
            }

            // Format title as "Product Title - Variant Title"
            // If variant title is "Default Title", just use product title
            const formattedTitle = variant.title === 'Default Title'
                ? product.title
                : `${product.title} - ${variant.title}`

            // Generate landing page URL
            const landingPageUrl = `https://yooppee.com/products/${product.handle}?variant=${variant.id}`

            transformed.push({
                variant_id: variant.id,
                shopify_product_id: product.id,
                title: formattedTitle,
                handle: product.handle,
                sku: variant.sku || '',
                price: parseFloat(variant.price),
                compare_at_price: variant.compare_at_price
                    ? parseFloat(variant.compare_at_price)
                    : null,
                inventory_quantity: variant.inventory_quantity ?? 0,
                weight: variant.weight !== null && variant.weight !== undefined ? variant.weight : null,
                image_url: variantImageUrl,
                landing_page_url: landingPageUrl,
                position: variant.position,
            })
        }
    }

    return transformed
}

// ============================================
// Complete Fetch & Transform Pipeline
// ============================================

export async function fetchAndTransformShopifyProducts(): Promise<TransformedProduct[]> {
    const shopifyProducts = await fetchShopifyProducts()
    return transformShopifyProducts(shopifyProducts)
}

// ============================================
// Comparison Helper
// ============================================

/**
 * Compare database product with live Shopify data
 * Returns fields that differ
 */
export interface ProductDiff {
    field: 'price' | 'inventory_quantity' | 'compare_at_price'
    dbValue: number | null
    liveValue: number | null
}

export function compareProducts(
    dbProduct: {
        price: number
        inventory_quantity: number
        compare_at_price: number | null
    },
    liveProduct: TransformedProduct
): ProductDiff[] {
    const diffs: ProductDiff[] = []

    if (dbProduct.price !== liveProduct.price) {
        diffs.push({
            field: 'price',
            dbValue: dbProduct.price,
            liveValue: liveProduct.price,
        })
    }

    if (dbProduct.inventory_quantity !== liveProduct.inventory_quantity) {
        diffs.push({
            field: 'inventory_quantity',
            dbValue: dbProduct.inventory_quantity,
            liveValue: liveProduct.inventory_quantity,
        })
    }

    if (dbProduct.compare_at_price !== liveProduct.compare_at_price) {
        diffs.push({
            field: 'compare_at_price',
            dbValue: dbProduct.compare_at_price,
            liveValue: liveProduct.compare_at_price,
        })
    }

    return diffs
}
