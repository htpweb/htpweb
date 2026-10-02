-- Historical production migration marker. The schema change was already applied directly to the production project before this repository snapshot was finalized.
-- This no-op file restores local/remote migration-version parity so Supabase CLI can validate subsequent migrations safely.
select 1;
