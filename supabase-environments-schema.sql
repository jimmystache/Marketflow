-- ==================== MODIFY EXISTING TABLES ====================

-- Add environment columns to markets table (markets will represent environments)
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

-- Add environment reference to orders (to support multiple stocks per environment)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_symbol TEXT;

-- Add environment reference to trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stock_symbol TEXT;

-- Add environment reference to positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS stock_symbol TEXT;

-- ==================== NEW TABLES ====================

-- Environment Stocks table (stocks available in each environment/market)
CREATE TABLE IF NOT EXISTS environment_stocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  description TEXT,
  starting_price NUMERIC(15, 2) DEFAULT 100.00,
  min_price_change NUMERIC(10, 4) DEFAULT 0.01,
  allow_shorting BOOLEAN,
  max_short_units INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, symbol)
);

-- Environment Participants table (traders who have joined an environment/market)
CREATE TABLE IF NOT EXISTS environment_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  cash NUMERIC(15, 2),
  settled_cash NUMERIC(15, 2),
  available_cash NUMERIC(15, 2),
  is_admin BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, trader_id)
);

-- Environment Positions table (positions specific to an environment)
CREATE TABLE IF NOT EXISTS environment_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES environment_participants(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES environment_stocks(id) ON DELETE CASCADE,
  units INTEGER DEFAULT 0,
  avg_price NUMERIC(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, stock_id)
);

-- Environment Orders table
CREATE TABLE IF NOT EXISTS environment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES environment_stocks(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES environment_participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  price NUMERIC(15, 2) NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  filled_units INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'filled', 'partial', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Environment Trades table
CREATE TABLE IF NOT EXISTS environment_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  stock_id UUID NOT NULL REFERENCES environment_stocks(id) ON DELETE CASCADE,
  buy_order_id UUID NOT NULL REFERENCES environment_orders(id) ON DELETE CASCADE,
  sell_order_id UUID NOT NULL REFERENCES environment_orders(id) ON DELETE CASCADE,
  buyer_participant_id UUID NOT NULL REFERENCES environment_participants(id) ON DELETE CASCADE,
  seller_participant_id UUID NOT NULL REFERENCES environment_participants(id) ON DELETE CASCADE,
  price NUMERIC(15, 2) NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_markets_creator ON markets(creator_id);
CREATE INDEX IF NOT EXISTS idx_markets_private ON markets(is_private);

CREATE INDEX IF NOT EXISTS idx_env_stocks_market ON environment_stocks(market_id);
CREATE INDEX IF NOT EXISTS idx_env_stocks_symbol ON environment_stocks(symbol);

CREATE INDEX IF NOT EXISTS idx_env_participants_market ON environment_participants(market_id);
CREATE INDEX IF NOT EXISTS idx_env_participants_trader ON environment_participants(trader_id);

CREATE INDEX IF NOT EXISTS idx_env_positions_participant ON environment_positions(participant_id);
CREATE INDEX IF NOT EXISTS idx_env_positions_stock ON environment_positions(stock_id);

CREATE INDEX IF NOT EXISTS idx_env_orders_market ON environment_orders(market_id);
CREATE INDEX IF NOT EXISTS idx_env_orders_stock ON environment_orders(stock_id);
CREATE INDEX IF NOT EXISTS idx_env_orders_participant ON environment_orders(participant_id);
CREATE INDEX IF NOT EXISTS idx_env_orders_status ON environment_orders(status);

CREATE INDEX IF NOT EXISTS idx_env_trades_market ON environment_trades(market_id);
CREATE INDEX IF NOT EXISTS idx_env_trades_stock ON environment_trades(stock_id);

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE environment_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_trades ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Allow anonymous read env_stocks" ON environment_stocks;
DROP POLICY IF EXISTS "Allow anonymous insert env_stocks" ON environment_stocks;
DROP POLICY IF EXISTS "Allow anonymous update env_stocks" ON environment_stocks;
DROP POLICY IF EXISTS "Allow anonymous delete env_stocks" ON environment_stocks;

DROP POLICY IF EXISTS "Allow anonymous read env_participants" ON environment_participants;
DROP POLICY IF EXISTS "Allow anonymous insert env_participants" ON environment_participants;
DROP POLICY IF EXISTS "Allow anonymous update env_participants" ON environment_participants;
DROP POLICY IF EXISTS "Allow anonymous delete env_participants" ON environment_participants;

DROP POLICY IF EXISTS "Allow anonymous read env_positions" ON environment_positions;
DROP POLICY IF EXISTS "Allow anonymous insert env_positions" ON environment_positions;
DROP POLICY IF EXISTS "Allow anonymous update env_positions" ON environment_positions;
DROP POLICY IF EXISTS "Allow anonymous delete env_positions" ON environment_positions;

DROP POLICY IF EXISTS "Allow anonymous read env_orders" ON environment_orders;
DROP POLICY IF EXISTS "Allow anonymous insert env_orders" ON environment_orders;
DROP POLICY IF EXISTS "Allow anonymous update env_orders" ON environment_orders;

DROP POLICY IF EXISTS "Allow anonymous read env_trades" ON environment_trades;
DROP POLICY IF EXISTS "Allow anonymous insert env_trades" ON environment_trades;

-- Allow anonymous access for demo (like existing tables)
CREATE POLICY "Allow anonymous read env_stocks" ON environment_stocks FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert env_stocks" ON environment_stocks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update env_stocks" ON environment_stocks FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete env_stocks" ON environment_stocks FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read env_participants" ON environment_participants FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert env_participants" ON environment_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update env_participants" ON environment_participants FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete env_participants" ON environment_participants FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read env_positions" ON environment_positions FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert env_positions" ON environment_positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update env_positions" ON environment_positions FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete env_positions" ON environment_positions FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read env_orders" ON environment_orders FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert env_orders" ON environment_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update env_orders" ON environment_orders FOR UPDATE USING (true);

CREATE POLICY "Allow anonymous read env_trades" ON environment_trades FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert env_trades" ON environment_trades FOR INSERT WITH CHECK (true);

-- ==================== REALTIME ====================

ALTER PUBLICATION supabase_realtime ADD TABLE environment_stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE environment_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE environment_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE environment_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE environment_trades;

-- ==================== TRIGGERS ====================

-- Function to update the updated_at timestamp (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp triggers for new tables
DROP TRIGGER IF EXISTS update_environment_stocks_updated_at ON environment_stocks;
CREATE TRIGGER update_environment_stocks_updated_at
  BEFORE UPDATE ON environment_stocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_environment_participants_updated_at ON environment_participants;
CREATE TRIGGER update_environment_participants_updated_at
  BEFORE UPDATE ON environment_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_environment_positions_updated_at ON environment_positions;
CREATE TRIGGER update_environment_positions_updated_at
  BEFORE UPDATE ON environment_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_environment_orders_updated_at ON environment_orders;
CREATE TRIGGER update_environment_orders_updated_at
  BEFORE UPDATE ON environment_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Done!
SELECT 'Trading environments schema created successfully!' AS message;
