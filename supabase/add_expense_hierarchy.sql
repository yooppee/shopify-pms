alter table "public"."expenses" add column "parent_id" uuid;
alter table "public"."expenses" add column "is_group" boolean default false;
