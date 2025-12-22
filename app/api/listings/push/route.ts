import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Reuse the service role client helper
function createServiceRoleClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    }
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        }
    )
}

// GraphQL mutation for creating/updating a product with all data
const PRODUCT_SET_MUTATION = `
  mutation productSet($input: ProductSetInput!) {
    productSet(input: $input) {
      product {
        id
        title
        status
        variants(first: 100) {
          edges {
            node {
              id
              title
              price
              sku
              inventoryItem {
                id
              }
            }
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`

// GraphQL mutation for updating inventory item cost
const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        unitCost {
          amount
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

// GraphQL query for fetching locations
const LOCATIONS_QUERY = `
  query {
    locations(first: 5) {
      edges {
        node {
          id
          name
          isActive
        }
      }
    }
  }
`

// GraphQL mutation for setting inventory quantities
const INVENTORY_SET_HAND_QUANTITIES_MUTATION = `
  mutation inventorySetHandQuantities($input: InventorySetHandQuantitiesInput!) {
    inventorySetHandQuantities(input: $input) {
      inventoryAdjustmentGroup {
        reason
        changes {
          delta
          quantity
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

async function shopifyGraphQL(shopDomain: string, accessToken: string, query: string, variables: any) {
    const response = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables })
    })

    const data = await response.json()

    if (data.errors) {
        console.error('GraphQL Errors:', data.errors)
        throw new Error(data.errors.map((e: any) => e.message).join(', '))
    }

    return data.data
}

export async function POST(request: Request) {
    try {
        const { id } = await request.json()
        if (!id) {
            return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 })
        }

        const supabase = createServiceRoleClient()

        // 1. Get Authentication Credentials
        const { data: credentials, error: dbError } = await supabase
            .from('shop_credentials')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (dbError || !credentials) {
            return NextResponse.json({ error: 'Shopify credentials not found' }, { status: 401 })
        }

        const { shop_domain, access_token } = credentials

        // 2. Get Listing Data
        const { data: listing, error: listingError } = await supabase
            .from('listing_drafts')
            .select('*')
            .eq('id', id)
            .single()

        if (listingError || !listing) {
            return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
        }

        const draftData = listing.draft_data

        // 3. Build ProductSet Input (product + options + variants in one call)
        const productSetInput: any = {
            title: draftData.title,
            descriptionHtml: draftData.description || '',
            vendor: draftData.vendor || '',
            productType: draftData.product_type || '',
            status: 'DRAFT',
            productOptions: [],
            variants: []
        }

        // Track costs for later update
        const variantCosts: { index: number; cost: number }[] = []
        // Track inventory for later update
        const variantStock: { index: number; quantity: number }[] = []

        // Handle Options
        if (draftData.options && Array.isArray(draftData.options) && draftData.options.length > 0) {
            productSetInput.productOptions = draftData.options.map((opt: any) => ({
                name: opt.name,
                values: opt.values.map((v: any) => ({ name: v }))
            }))
        }

        // Handle Variants
        if (draftData.variants && Array.isArray(draftData.variants) && draftData.variants.length > 0) {
            productSetInput.variants = draftData.variants.map((v: any, index: number) => {
                if (v.cost != null) {
                    variantCosts.push({ index, cost: v.cost })
                }
                if (v.inventory_quantity != null) {
                    variantStock.push({ index, quantity: v.inventory_quantity })
                }

                const variantInput: any = {
                    price: v.price || 0,
                    inventoryItem: {
                        sku: v.sku || '',
                        measurement: {
                            weight: {
                                value: v.weight || 0,
                                unit: 'GRAMS'
                            }
                        }
                    },
                    inventoryPolicy: 'DENY',
                    optionValues: []
                }

                if (v.compare_at_price != null) {
                    variantInput.compareAtPrice = v.compare_at_price
                }

                // Map option values for this variant
                if (v.option1 && draftData.options?.[0]) {
                    variantInput.optionValues.push({
                        optionName: draftData.options[0].name,
                        name: v.option1
                    })
                }
                if (v.option2 && draftData.options?.[1]) {
                    variantInput.optionValues.push({
                        optionName: draftData.options[1].name,
                        name: v.option2
                    })
                }
                if (v.option3 && draftData.options?.[2]) {
                    variantInput.optionValues.push({
                        optionName: draftData.options[2].name,
                        name: v.option3
                    })
                }

                return variantInput
            })
        } else {
            // Single variant product (no options)
            if (draftData.cost != null) {
                variantCosts.push({ index: 0, cost: draftData.cost })
            }
            if (draftData.inventory_quantity != null) {
                variantStock.push({ index: 0, quantity: draftData.inventory_quantity })
            }

            productSetInput.variants = [{
                price: draftData.price || 0,
                inventoryItem: {
                    sku: draftData.sku || '',
                    measurement: {
                        weight: {
                            value: draftData.weight || 0,
                            unit: 'GRAMS'
                        }
                    }
                },
                inventoryPolicy: 'DENY',
                compareAtPrice: draftData.compare_at_price || null,
                optionValues: [
                    {
                        optionName: 'Title',
                        name: 'Default Title'
                    }
                ]
            }]

            // Explicitly set productOptions for single variant "Default Title" behavior
            productSetInput.productOptions = [{
                name: 'Title',
                values: [{ name: 'Default Title' }]
            }]


        }

        console.log('Creating product with productSet:', JSON.stringify(productSetInput, null, 2))

        // 4. Create Product via productSet
        const result = await shopifyGraphQL(
            shop_domain,
            access_token,
            PRODUCT_SET_MUTATION,
            { input: productSetInput }
        )

        console.log('ProductSet result:', JSON.stringify(result, null, 2))

        if (result.productSet.userErrors?.length > 0) {
            console.error('Shopify User Errors:', result.productSet.userErrors)
            const errorMessages = result.productSet.userErrors.map((e: any) => e.message).join(', ')
            return NextResponse.json({
                error: `Failed to create product: ${errorMessages}`,
                details: result.productSet.userErrors
            }, { status: 500 })
        }

        const shopifyProduct = result.productSet.product
        const createdVariants = shopifyProduct.variants?.edges?.map((e: any) => e.node) || []

        console.log(`Created product with ${createdVariants.length} variants`)

        // 5. Update Inventory Item Costs
        console.log('Variant costs to update:', variantCosts)
        console.log('Created variants with inventory items:', createdVariants.map((v: any) => ({
            id: v.id,
            inventoryItemId: v.inventoryItem?.id
        })))

        for (const costEntry of variantCosts) {
            const variant = createdVariants[costEntry.index]
            console.log(`Processing cost for index ${costEntry.index}, cost: ${costEntry.cost}, variant:`, variant?.id)

            if (variant?.inventoryItem?.id) {
                try {
                    const costResult = await shopifyGraphQL(
                        shop_domain,
                        access_token,
                        INVENTORY_ITEM_UPDATE_MUTATION,
                        {
                            id: variant.inventoryItem.id,
                            input: {
                                cost: costEntry.cost.toString()
                            }
                        }
                    )
                    console.log(`Cost update result for ${variant.id}:`, JSON.stringify(costResult, null, 2))
                } catch (costError) {
                    console.error(`Failed to update cost for variant ${variant.id}:`, costError)
                }
            } else {
                console.log(`No inventory item found for variant at index ${costEntry.index}`)
            }
        }

        // 6. Update Inventory Quantities
        if (variantStock.length > 0) {
            console.log('Fetching locations for inventory sync...')
            try {
                const locationsData = await shopifyGraphQL(shop_domain, access_token, LOCATIONS_QUERY, {})
                const locationId = locationsData.locations.edges[0]?.node?.id

                if (locationId) {
                    const quantitiesInput = variantStock.map(stockEntry => {
                        const variant = createdVariants[stockEntry.index]
                        if (variant?.inventoryItem?.id) {
                            return {
                                inventoryItemId: variant.inventoryItem.id,
                                locationId: locationId,
                                quantity: stockEntry.quantity
                            }
                        }
                        return null
                    }).filter(Boolean)

                    if (quantitiesInput.length > 0) {
                        console.log('Syncing inventory quantities:', quantitiesInput)
                        const inventoryResult = await shopifyGraphQL(
                            shop_domain,
                            access_token,
                            INVENTORY_SET_HAND_QUANTITIES_MUTATION,
                            {
                                input: {
                                    reason: 'correction',
                                    ignoreCompareQuantity: true,
                                    quantities: quantitiesInput
                                }
                            }
                        )
                        console.log('Inventory sync result:', JSON.stringify(inventoryResult, null, 2))
                    }
                } else {
                    console.error('No location found to sync inventory')
                }
            } catch (invError) {
                console.error('Failed to sync inventory:', invError)
            }
        }

        // 7. Update Database Record
        const shopifyIdMatch = shopifyProduct.id.match(/\d+$/)
        const shopifyNumericId = shopifyIdMatch ? shopifyIdMatch[0] : shopifyProduct.id

        console.log('Updating database with is_pushed: true for listing:', id)

        const { error: updateError } = await supabase
            .from('listing_drafts')
            .update({
                updated_at: new Date().toISOString(),
                draft_data: {
                    ...draftData,
                    is_pushed: true,
                    shopify_product_id: shopifyNumericId // Store in draft_data instead
                }
            })
            .eq('id', id)

        if (updateError) {
            console.error('Database update error:', updateError)
        } else {
            console.log('Database updated successfully, is_pushed set to true')
        }

        return NextResponse.json({
            success: true,
            product: {
                id: shopifyNumericId,
                title: shopifyProduct.title,
                status: shopifyProduct.status,
                variantsCount: createdVariants.length
            }
        })

    } catch (error: any) {
        console.error('Push error:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
