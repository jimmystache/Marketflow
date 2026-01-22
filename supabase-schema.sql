-- MarketFlow Trading Simulator Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== TABLES ====================

-- Traders table
CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  cash DECIMAL(15, 2) DEFAULT 10000.00,
  settled_cash DECIMAL(15, 2) DEFAULT 10000.00,
  available_cash DECIMAL(15, 2) DEFAULT 10000.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Markets tableLets ha
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  price DECIMAL(15, 2) NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  filled_units INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'filled', 'partial', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades table (executed trades)
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  buy_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sell_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  price DECIMAL(15, 2) NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Positions table (trader holdings)
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  units INTEGER DEFAULT 100,
  avg_price DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trader_id, market_id)
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_orders_market_id ON orders(market_id);
CREATE INDEX IF NOT EXISTS idx_orders_trader_id ON orders(trader_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_buyer_id ON trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_trades_seller_id ON trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_positions_trader_id ON positions(trader_id);
CREATE INDEX IF NOT EXISTS idx_positions_market_id ON positions(market_id);

-- ==================== ROW LEVEL SECURITY ====================

-- Enable RLS on all tables
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for the trading simulator (for demo purposes)
-- In production, you'd want proper authentication

-- Traders policies
CREATE POLICY "Allow anonymous read traders" ON traders FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert traders" ON traders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update traders" ON traders FOR UPDATE USING (true);

-- Markets policies
CREATE POLICY "Allow anonymous read markets" ON markets FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert markets" ON markets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update markets" ON markets FOR UPDATE USING (true);

-- Orders policies
CREATE POLICY "Allow anonymous read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update orders" ON orders FOR UPDATE USING (true);

-- Trades policies
CREATE POLICY "Allow anonymous read trades" ON trades FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert trades" ON trades FOR INSERT WITH CHECK (true);

-- Positions policies
CREATE POLICY "Allow anonymous read positions" ON positions FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert positions" ON positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update positions" ON positions FOR UPDATE USING (true);

-- ==================== REALTIME ====================

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE traders;
ALTER PUBLICATION supabase_realtime ADD TABLE markets;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;

-- ==================== SAMPLE DATA ====================

-- Insert a default market
INSERT INTO markets (symbol, name, status) 
VALUES ('MKT', 'Demo Market', 'open')
ON CONFLICT (symbol) DO NOTHING;

-- ==================== FUNCTIONS ====================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_traders_updated_at ON traders;
CREATE TRIGGER update_traders_updated_at
  BEFORE UPDATE ON traders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_positions_updated_at ON positions;
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Done!
SELECT 'Database schema created successfully!' AS message;
