import { createClient } from '@supabase/supabase-js'
import { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 添加自定义配置以改善网络稳定性和处理代理环境
const supabaseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      'x-client-info': 'supabase-js-web',
    },
    // 增加超时时间以应对网络延迟
    fetch: (...args: Parameters<typeof fetch>) => {
      return fetch(...args)
    },
  },
  db: {
    schema: 'public' as const,
  },
}

// Client-side Supabase client with types
export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  supabaseOptions
)

// Untyped client for JSONB operations (workaround for type inference issues)
export const supabaseUntyped = createClient(
  supabaseUrl,
  supabaseAnonKey,
  supabaseOptions
)

// Server-side Supabase client (for use in Server Components and API Routes)
export function createServerClient() {
  return createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    supabaseOptions
  )
}

// Untyped server client
export function createServerClientUntyped() {
  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    supabaseOptions
  )
}
