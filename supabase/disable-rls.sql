-- 🚀 快速修复：完全禁用 RLS（仅用于开发环境）
-- 在 Supabase SQL Editor 中运行这段 SQL

-- 禁用所有表的 Row Level Security
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE listing_drafts DISABLE ROW LEVEL SECURITY;

-- 验证 RLS 已禁用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('products', 'user_events', 'listing_drafts');

-- 应该显示 rowsecurity = false
