-- Quick fix: Add missing columns to markets table

-- Add all environment-related columns to markets table
ALTER TABLE markets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES traders(id);
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS starting_cash NUMERIC(15, 2) DEFAULT 10000.00;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS starting_shares INTEGER DEFAULT 100;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS min_price_change NUMERIC(10, 4) DEFAULT 0.01;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS allow_shorting BOOLEAN DEFAULT false;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS max_short_units INTEGER DEFAULT 0;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Add stock_symbol to related tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_symbol TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stock_symbol TEXT;
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stock_symbol TEXT;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'markets' 
AND column_name IN ('description', 'creator_id', 'is_private', 'password_hash', 'starting_cash', 'starting_shares', 'min_price_change', 'allow_shorting', 'max_short_units', 'is_paused', 'pause_reason');
