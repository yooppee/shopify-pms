# 🔧 网络连接问题修复指南

## 问题诊断

错误信息：
```
Client network socket disconnected before secure TLS connection was established
```

**原因：** 这是 TLS/SSL 网络连接问题，可能由以下原因导致：
- 网络不稳定
- 防火墙或代理阻止连接
- DNS 解析问题
- Supabase 服务暂时不可用

---

## 🔧 解决方案

### 方案 1: 检查网络连接（最常见）

#### 测试 Supabase 连接
在终端运行：
```bash
ping okbvorhyfypbfmyqglom.supabase.co
```

如果无法 ping 通，说明网络连接有问题。

#### 解决步骤：
1. **检查网络连接**：确保您的电脑已连接到互联网
2. **检查防火墙**：临时禁用防火墙测试（记得重新启用）
3. **检查代理设置**：如果使用代理，确保配置正确
4. **切换网络**：尝试切换到其他网络（如手机热点）

---

### 方案 2: 使用备用 Supabase 客户端配置

有时 Node.js 的网络配置需要调整。更新 Supabase 客户端配置：

#### 修改 `lib/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 添加自定义配置以改善网络稳定性
const supabaseOptions = {
  auth: {
    persistSession: false,
  },
  global: {
    headers: {
      'x-client-info': 'supabase-js-web',
    },
  },
  db: {
    schema: 'public',
  },
  // 增加超时时间
  realtime: {
    timeout: 30000,
  },
}

// Client-side Supabase client with types
export const supabase = createClient<Database>(
  supabaseUrl, 
  supabaseAnonKey,
  supabaseOptions
)

// Untyped client for JSONB operations
export const supabaseUntyped = createClient(
  supabaseUrl, 
  supabaseAnonKey,
  supabaseOptions
)

// Server-side clients
export function createServerClient() {
  return createClient<Database>(
    supabaseUrl, 
    supabaseAnonKey,
    supabaseOptions
  )
}

export function createServerClientUntyped() {
  return createClient(
    supabaseUrl, 
    supabaseAnonKey,
    supabaseOptions
  )
}
```

---

### 方案 3: 重试机制

在 API 路由中添加重试逻辑。修改 `app/api/sync/route.ts`：

```typescript
// 在文件顶部添加重试函数
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      console.log(`Retry ${i + 1}/${maxRetries} after error:`, error)
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
    }
  }
  throw new Error('Max retries exceeded')
}

// 在 POST 函数中使用重试
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClientUntyped()
    
    console.log('Fetching Shopify products...')
    const transformedProducts = await fetchAndTransformShopifyProducts()
    console.log(`Fetched ${transformedProducts.length} product variants`)
    
    const productsToUpsert = transformedProducts.map(product => ({
      variant_id: product.variant_id,
      shopify_product_id: product.shopify_product_id,
      title: product.title,
      handle: product.handle,
      sku: product.sku,
      price: product.price,
      compare_at_price: product.compare_at_price,
      inventory_quantity: product.inventory_quantity,
      weight: product.weight,
      image_url: product.image_url,
      landing_page_url: product.landing_page_url,
      internal_meta: {},
    }))
    
    // 使用重试机制
    const { data, error } = await retryOperation(async () => {
      return await supabase
        .from('products')
        .upsert(productsToUpsert, {
          onConflict: 'variant_id',
          ignoreDuplicates: false,
        })
        .select()
    })
    
    if (error) {
      console.error('Supabase upsert error:', error)
      return NextResponse.json(
        { error: 'Failed to sync products', details: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      synced: data?.length || 0,
      message: `Successfully synced ${data?.length || 0} products`,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to sync products', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}
```

---

### 方案 4: 检查 Supabase 项目状态

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 检查项目状态：
   - 项目是否处于 **Active** 状态？
   - 是否显示 **Paused** 或 **Inactive**？
3. 如果项目暂停，点击 **Restore** 恢复项目

---

### 方案 5: 临时使用本地数据测试

如果网络问题持续，可以先跳过同步，手动插入测试数据：

#### 在 Supabase SQL Editor 中运行：

```sql
-- 插入测试产品数据
INSERT INTO products (
  variant_id, 
  shopify_product_id, 
  title, 
  handle, 
  sku, 
  price, 
  inventory_quantity,
  internal_meta
) VALUES 
(12345, 67890, 'Test Product - Variant 1', 'test-product', 'TEST-001', 99.99, 10, '{}'),
(12346, 67890, 'Test Product - Variant 2', 'test-product', 'TEST-002', 89.99, 5, '{}'),
(12347, 67891, 'Another Product', 'another-product', 'TEST-003', 49.99, 20, '{}');
```

然后刷新 Inventory 页面，应该能看到这些测试数据。

---

## 🔍 诊断步骤

### 1. 检查网络连接
```bash
# Windows
ping okbvorhyfypbfmyqglom.supabase.co

# 测试 HTTPS 连接
curl https://okbvorhyfypbfmyqglom.supabase.co
```

### 2. 检查 DNS 解析
```bash
nslookup okbvorhyfypbfmyqglom.supabase.co
```

### 3. 查看详细错误日志
在浏览器开发者工具（F12）的 Console 和 Network 标签中查看详细错误。

---

## ✅ 快速修复建议

**最快的解决方案：**

1. **重启路由器/调制解调器**
2. **切换到手机热点测试**
3. **检查 Supabase 项目是否暂停**
4. **如果是公司网络，联系 IT 部门检查防火墙设置**

**如果急需测试功能：**
- 使用方案 5 插入测试数据
- 先测试其他功能（编辑、计算等）
- 等网络稳定后再同步

---

## 📞 需要更多帮助？

如果问题持续：
1. 分享完整的错误日志
2. 告诉我您的网络环境（家庭/公司/学校）
3. 是否使用 VPN 或代理
4. Supabase 项目状态

我会根据具体情况提供针对性解决方案！
