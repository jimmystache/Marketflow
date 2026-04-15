const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wqwijeadpwbfhabcnfna.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxd2lqZWFkcHdiZmhhYmNuZm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc1ODI1NjgsImV4cCI6MjA1MzE1ODU2OH0.sb_secret_xaHPq8MCLk-dwTj6UEllvg_0FhAgWVv';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  // Try to list traders
  console.log('Checking traders table...');
  const { data: traders, error: tradersError } = await supabase.from('traders').select('*').limit(1);
  console.log('Traders:', traders, 'Error:', tradersError);

  // Try to list markets
  console.log('Checking markets table...');
  const { data: markets, error: marketsError } = await supabase.from('markets').select('*').limit(1);
  console.log('Markets:', markets, 'Error:', marketsError);

  // Try to list orders
  console.log('Checking orders table...');
  const { data: orders, error: ordersError } = await supabase.from('orders').select('*').limit(1);
  console.log('Orders:', orders, 'Error:', ordersError);

  // Try to list trades
  console.log('Checking trades table...');
  const { data: trades, error: tradesError } = await supabase.from('trades').select('*').limit(1);
  console.log('Trades:', trades, 'Error:', tradesError);

  // Try to list positions
  console.log('Checking positions table...');
  const { data: positions, error: positionsError } = await supabase.from('positions').select('*').limit(1);
  console.log('Positions:', positions, 'Error:', positionsError);
}

checkTables();
