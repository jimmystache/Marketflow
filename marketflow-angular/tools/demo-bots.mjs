import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

function getArg(name, fallback) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return fallback;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) return fallback;
  return val;
}

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(value, fallback) {
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(items) {
  // items: Array<{ value: any, weight: number }>
  const total = items.reduce((sum, it) => sum + Math.max(0, it.weight), 0);
  if (total <= 0) return items[0]?.value;
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, it.weight);
    if (r <= 0) return it.value;
  }
  return items.at(-1)?.value;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nowMs() {
  return Date.now();
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(randBetween(min, max + 1));
}

function formatUsd(n) {
  return `$${Number(n).toFixed(2)}`;
}

function tryLoadDotEnv() {
  // Minimal .env loader (no dependency): supports KEY=VALUE lines.
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'tools', '.env'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '.env')
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = val;
      }
      return;
    } catch {
      // ignore
    }
  }
}

async function upsertMarket(supabase, symbol, name) {
  const { data: existing } = await supabase.from('markets').select('*').eq('symbol', symbol).single();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('markets')
    .insert({ symbol, name, status: 'open' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getMarketById(supabase, marketId) {
  const id = String(marketId || '').trim();
  if (!id) throw new Error('Missing market id');
  const { data, error } = await supabase.from('markets').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getEnvironmentStockById(supabase, stockId) {
  const id = String(stockId || '').trim();
  if (!id) throw new Error('Missing stock id');
  const { data, error } = await supabase.from('environment_stocks').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function getOrCreateTrader(supabase, username) {
  const { data: existing } = await supabase.from('traders').select('*').eq('username', username).single();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('traders')
    .insert({ username, cash: 10000, settled_cash: 10000, available_cash: 10000 })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateEnvironmentStock(supabase, marketId, symbol, startingPrice) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym) throw new Error('Missing --stock (symbol)');

  const { data: existing } = await supabase
    .from('environment_stocks')
    .select('*')
    .eq('market_id', marketId)
    .eq('symbol', sym)
    .single();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('environment_stocks')
    .insert({
      market_id: marketId,
      symbol: sym,
      name: `${sym} Demo Stock`,
      starting_price: Number(startingPrice) || 100,
      min_price_change: 0.01
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateParticipant(supabase, marketId, traderId, startingCash) {
  const { data: existing } = await supabase
    .from('environment_participants')
    .select('*')
    .eq('market_id', marketId)
    .eq('trader_id', traderId)
    .single();
  if (existing) return existing;

  const cash = Number(startingCash) || 10000;
  const { data, error } = await supabase
    .from('environment_participants')
    .insert({
      market_id: marketId,
      trader_id: traderId,
      cash,
      settled_cash: cash,
      available_cash: cash,
      is_admin: false
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateEnvironmentPosition(supabase, marketId, participantId, stockId, startingUnits) {
  const { data: existing } = await supabase
    .from('environment_positions')
    .select('*')
    .eq('participant_id', participantId)
    .eq('stock_id', stockId)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('environment_positions')
    .insert({
      market_id: marketId,
      participant_id: participantId,
      stock_id: stockId,
      units: Number(startingUnits) || 100,
      avg_price: 0
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function placeOrder(supabase, { marketId, stockId, participantId, type, price, units }) {
  const { data, error } = await supabase
    .from('environment_orders')
    .insert({
      market_id: marketId,
      stock_id: stockId,
      participant_id: participantId,
      type,
      price,
      units,
      filled_units: 0,
      status: 'open'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function updateOrderFill(supabase, orderId, filledUnits, status) {
  const { error } = await supabase
    .from('environment_orders')
    .update({ filled_units: filledUnits, status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

async function cancelOrder(supabase, orderId) {
  const { error } = await supabase
    .from('environment_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

async function recordTrade(supabase, { marketId, buyOrder, sellOrder, price, units }) {
  const { data, error } = await supabase
    .from('environment_trades')
    .insert({
      market_id: marketId,
      stock_id: buyOrder.stock_id,
      buy_order_id: buyOrder.id,
      sell_order_id: sellOrder.id,
      buyer_participant_id: buyOrder.participant_id,
      seller_participant_id: sellOrder.participant_id,
      price,
      units
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function tryMatchOne(supabase, marketId, stockId) {
  // Find best bid and best ask among open/partial orders.
  const { data: openOrders, error } = await supabase
    .from('environment_orders')
    .select('*')
    .eq('market_id', marketId)
    .eq('stock_id', stockId)
    .in('status', ['open', 'partial']);

  if (error) throw error;

  const bids = (openOrders || [])
    .filter((o) => o.type === 'buy')
    .sort((a, b) => Number(b.price) - Number(a.price) || new Date(a.created_at) - new Date(b.created_at));
  const asks = (openOrders || [])
    .filter((o) => o.type === 'sell')
    .sort((a, b) => Number(a.price) - Number(b.price) || new Date(a.created_at) - new Date(b.created_at));

  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (!bestBid || !bestAsk) return false;

  const bidPrice = Number(bestBid.price);
  const askPrice = Number(bestAsk.price);
  if (bidPrice < askPrice) return false;

  const bidRemaining = Number(bestBid.units) - Number(bestBid.filled_units);
  const askRemaining = Number(bestAsk.units) - Number(bestAsk.filled_units);
  const units = Math.max(1, Math.min(bidRemaining, askRemaining));

  // Trade at the ask (simple rule).
  const price = askPrice;

  await recordTrade(supabase, { marketId, buyOrder: bestBid, sellOrder: bestAsk, price, units });

  const newBidFilled = Number(bestBid.filled_units) + units;
  const newAskFilled = Number(bestAsk.filled_units) + units;
  await updateOrderFill(supabase, bestBid.id, newBidFilled, newBidFilled >= Number(bestBid.units) ? 'filled' : 'partial');
  await updateOrderFill(supabase, bestAsk.id, newAskFilled, newAskFilled >= Number(bestAsk.units) ? 'filled' : 'partial');

  return true;
}

async function tryMatchMany(supabase, marketId, stockId, maxMatches) {
  let didAny = false;
  for (let i = 0; i < maxMatches; i++) {
    // eslint-disable-next-line no-await-in-loop
    const did = await tryMatchOne(supabase, marketId, stockId);
    if (!did) break;
    didAny = true;
  }
  return didAny;
}

async function main() {
  tryLoadDotEnv();

  if (getFlag('help') || getFlag('h')) {
    console.log(`Demo bots for MarketFlow (Supabase)

Usage:
  npm run demo:bots -- --symbol ENV --stock MKT --bots 10 --intervalMs 450
  npm run demo:bots -- --environmentId <uuid> --stockId <uuid>

Credentials (env or args):
  SUPABASE_URL, SUPABASE_ANON_KEY
  or --url https://... --key ...

Common options:
  --durationSec 30       Stop after N seconds (default: 30)
  --environmentId <uuid> Target a specific environment by id (overrides --symbol)
  --stock MKT            Stock symbol within the environment (default: MKT)
  --stockId <uuid>       Target a specific stock by id (overrides --stock)
  --bots 8               Number of bot traders
  --intervalMs 450       Main loop tick interval
  --basePrice 200        Starting mid price
  --volatility 0.8       Base volatility
  --spread 1.4           Base spread
  --tradePct 0.55        How often bots try to generate prints
  --cancelPct 0.10       How often bots cancel/adjust
  --injectPct 0.15       How often to force a crossing print
  --quietPct 0.08        Chance the market enters a quiet regime
  --verbose              Log market regime ticks
`);
    process.exit(0);
  }

  const url = getArg('url', process.env.SUPABASE_URL);
  const key = getArg('key', process.env.SUPABASE_ANON_KEY);

  if (!url || !key) {
    console.error(
      'Missing Supabase credentials. Set env vars SUPABASE_URL and SUPABASE_ANON_KEY (or pass --url and --key).'
    );
    process.exit(1);
  }

  const environmentIdArg = getArg('environmentId', '');
  const symbol = getArg('symbol', 'MKT');
  const stockIdArg = getArg('stockId', '');
  const stockSymbol = getArg('stock', 'MKT');
  const bots = toInt(getArg('bots', '8'), 8);
  const intervalMs = toInt(getArg('intervalMs', '450'), 450);
  const durationSec = toInt(getArg('durationSec', '30'), 30);
  const basePrice = toFloat(getArg('basePrice', '200'), 200);
  const maxOpenPerBot = toInt(getArg('maxOpenPerBot', '8'), 8);
  const verbose = getFlag('verbose');

  // Human-ish market regimes (the market changes mood over time).
  const baseVolatility = toFloat(getArg('volatility', '0.8'), 0.8);
  const baseSpread = toFloat(getArg('spread', '1.4'), 1.4);
  const minSpread = toFloat(getArg('minSpread', '0.4'), 0.4);
  const maxSpread = toFloat(getArg('maxSpread', '3.0'), 3.0);

  const baselineTradePct = clamp(toFloat(getArg('tradePct', '0.55'), 0.55), 0, 1);
  const baselineCancelPct = clamp(toFloat(getArg('cancelPct', '0.10'), 0.10), 0, 1);
  const injectionPct = clamp(toFloat(getArg('injectPct', '0.15'), 0.15), 0, 1);
  const quietModePct = clamp(toFloat(getArg('quietPct', '0.08'), 0.08), 0, 1);

  const supabase = createClient(url, key);

  const market = environmentIdArg
    ? await getMarketById(supabase, environmentIdArg)
    : await upsertMarket(supabase, symbol, `${symbol} Demo Market`);

  const stock = stockIdArg
    ? await getEnvironmentStockById(supabase, stockIdArg)
    : await getOrCreateEnvironmentStock(supabase, market.id, stockSymbol, basePrice);

  if (stock.market_id !== market.id) {
    throw new Error(
      `Stock ${stock.id} belongs to environment ${stock.market_id}, not ${market.id}. Pick a matching --environmentId/--stockId pair.`
    );
  }

  // Per-bot personality makes the flow look more human.
  const personalities = [
    { name: 'scalper', aggression: 0.8, cancel: 0.18, avgUnits: 4, bigChance: 0.01 },
    { name: 'maker', aggression: 0.35, cancel: 0.08, avgUnits: 6, bigChance: 0.02 },
    { name: 'swing', aggression: 0.2, cancel: 0.05, avgUnits: 10, bigChance: 0.05 }
  ];

  const botUsers = [];
  for (let i = 0; i < bots; i++) {
    const username = `BOT_${String(i + 1).padStart(2, '0')}`;
    const trader = await getOrCreateTrader(supabase, username);
    const participant = await getOrCreateParticipant(supabase, market.id, trader.id, 10000);
    await getOrCreateEnvironmentPosition(supabase, market.id, participant.id, stock.id, 100);
    botUsers.push({ trader, participant });
  }

  console.log(`Demo bots running for environment ${market.symbol} (${market.id})`);
  console.log(`- stock=${stock.symbol} (${stock.id})`);
  console.log(`- bots=${bots} intervalMs=${intervalMs} durationSec=${durationSec || '∞'}`);
  console.log(`- volatility mode: ${volatilityMode} (${baseVolatility.toFixed(2)})`);
  console.log('Press Ctrl+C to stop.');

  let mid = basePrice;
  let stopped = false;
  const startedAt = nowMs();

  // Market regime: drift + volatility + spread can change every so often.
  let regime = {
    driftPerSec: randBetween(-0.25, 0.25),
    volatility: baseVolatility,
    spread: baseSpread,
    quiet: false,
    nextChangeAt: nowMs() + randInt(12_000, 45_000)
  };

  process.on('SIGINT', () => {
    stopped = true;
    console.log('\nStopping...');
  });

  const botState = botUsers.map((u, i) => {
    const personality = personalities[i % personalities.length];
    return {
      trader: u.trader,
      participant: u.participant,
      personality,
      nextActionAt: nowMs() + randInt(50, 1000),
      burstUntil: 0,
      pauseUntil: 0,
      recentOrders: []
    };
  });

  let lastLogAt = 0;

  while (!stopped) {
    const t = nowMs();
    if (durationSec > 0 && t - startedAt > durationSec * 1000) {
      stopped = true;
      break;
    }

    // Regime shift.
    if (t >= regime.nextChangeAt) {
      regime = {
        driftPerSec: randBetween(-0.35, 0.35),
        volatility: baseVolatility * randBetween(0.6, 1.6),
        spread: clamp(baseSpread * randBetween(0.6, 1.8), minSpread, maxSpread),
        quiet: Math.random() < quietModePct,
        nextChangeAt: t + randInt(12_000, 45_000)
      };
      if (verbose) {
        console.log(
          `[regime] drift=${regime.driftPerSec.toFixed(2)}/s vol=${regime.volatility.toFixed(2)} spread=${regime.spread.toFixed(2)} quiet=${regime.quiet}`
        );
      }
    }

    // Random walk mid (drift + noise).
    const dtSec = intervalMs / 1000;
    mid = clamp(mid + regime.driftPerSec * dtSec + (Math.random() - 0.5) * regime.volatility, 1, 100000);

    // Every loop: try to match a few times to keep trades flowing.
    try {
      // eslint-disable-next-line no-await-in-loop
      await tryMatchMany(supabase, market.id, stock.id, regime.quiet ? 1 : 3);
    } catch {
      // ignore
    }

    // Per-bot actions.
    for (const b of botState) {
      if (t < b.nextActionAt) continue;
      if (t < b.pauseUntil) continue;

      // Decide if the bot is in a burst (lots of activity) or pausing.
      if (b.burstUntil === 0 && Math.random() < 0.06) {
        b.burstUntil = t + randInt(6_000, 18_000);
      }
      if (b.pauseUntil === 0 && Math.random() < 0.03) {
        b.pauseUntil = t + randInt(4_000, 14_000);
        b.burstUntil = 0;
        continue;
      }
      if (b.burstUntil > 0 && t > b.burstUntil) {
        b.burstUntil = 0;
      }
      if (b.pauseUntil > 0 && t > b.pauseUntil) {
        b.pauseUntil = 0;
      }

      const personality = b.personality;
      const actionDelay = b.burstUntil > 0 ? randInt(180, 700) : randInt(500, 1800);
      b.nextActionAt = t + actionDelay;

      // Occasionally cancel one of your recent orders (feels like humans adjusting quotes).
      if (Math.random() < baselineCancelPct * personality.cancel) {
        const victim = b.recentOrders.find((o) => o && (o.status === 'open' || o.status === 'partial'));
        if (victim) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await cancelOrder(supabase, victim.id);
            victim.status = 'cancelled';
            continue;
          } catch {
            // ignore
          }
        }
      }

      // Choose action type.
      const wantsTrade = Math.random() < baselineTradePct * personality.aggression * (regime.quiet ? 0.35 : 1);
      const willInject = wantsTrade && Math.random() < injectionPct;

      // Size: mostly small/medium, occasional large prints.
      const big = Math.random() < personality.bigChance;
      const unitsBase = big ? randInt(25, 90) : clamp(Math.round(randBetween(1, personality.avgUnits * 2.5)), 1, 50);
      const units = clamp(unitsBase + randInt(0, 3), 1, 100);

      if (wantsTrade && willInject) {
        // Inject a crossing pair between two bots to guarantee a print.
        const buyer = b.participant;
        const seller = pick(botUsers.filter((x) => x.participant.id !== buyer.id)).participant;
        const buyPx = Number((mid + regime.spread / 2 + randBetween(0.01, 0.25)).toFixed(2));
        const sellPx = Number((mid - regime.spread / 2 - randBetween(0.01, 0.25)).toFixed(2));
        try {
          // eslint-disable-next-line no-await-in-loop
          const buy = await placeOrder(supabase, { marketId: market.id, stockId: stock.id, participantId: buyer.id, type: 'buy', price: buyPx, units });
          // eslint-disable-next-line no-await-in-loop
          const sell = await placeOrder(supabase, { marketId: market.id, stockId: stock.id, participantId: seller.id, type: 'sell', price: sellPx, units });

          // eslint-disable-next-line no-await-in-loop
          await recordTrade(supabase, { marketId: market.id, buyOrder: buy, sellOrder: sell, price: Number(mid.toFixed(2)), units });
          // eslint-disable-next-line no-await-in-loop
          await updateOrderFill(supabase, buy.id, units, 'filled');
          // eslint-disable-next-line no-await-in-loop
          await updateOrderFill(supabase, sell.id, units, 'filled');

          b.recentOrders.unshift(buy);
          b.recentOrders = b.recentOrders.slice(0, 30);
        } catch {
          // ignore
        }
        continue;
      }

      // Otherwise: place a limit order near mid (maker) or slightly aggressive.
      const side = Math.random() < 0.5 ? 'buy' : 'sell';
      const skew = (Math.random() - 0.5) * regime.spread * (personality.name === 'scalper' ? 0.6 : 1.2);
      const away = Math.abs(skew) + randBetween(0.05, regime.spread * 1.3);
      const px =
        side === 'buy'
          ? mid - away * (personality.aggression > 0.6 ? 0.6 : 1.0)
          : mid + away * (personality.aggression > 0.6 ? 0.6 : 1.0);

      // Keep book somewhat sane.
      const price = Number(clamp(px, 0.01, 100000).toFixed(2));

      try {
        // eslint-disable-next-line no-await-in-loop
        const order = await placeOrder(supabase, {
          marketId: market.id,
          stockId: stock.id,
          participantId: b.participant.id,
          type: side,
          price,
          units
        });

        b.recentOrders.unshift(order);
        b.recentOrders = b.recentOrders.slice(0, 30);

        // Light cleanup: if we have too many open orders in memory, cancel oldest.
        const openCount = b.recentOrders.filter((o) => o && (o.status === 'open' || o.status === 'partial')).length;
        if (openCount > maxOpenPerBot) {
          const toCancel = b.recentOrders
            .filter((o) => o && (o.status === 'open' || o.status === 'partial'))
            .slice(maxOpenPerBot);
          for (const o of toCancel) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await cancelOrder(supabase, o.id);
              o.status = 'cancelled';
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (verbose && t - lastLogAt > 5_000) {
      lastLogAt = t;
      console.log(`[tick] mid=${formatUsd(mid)} spread≈${regime.spread.toFixed(2)} quiet=${regime.quiet}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
