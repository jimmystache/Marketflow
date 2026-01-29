# Database Setup for Trading Environments

## ⚠️ IMPORTANT: You must run the database migration before the environment features will work!

The error you're seeing (`406 Not Acceptable` on `environment_participants` table) means the database tables haven't been created yet.

## Setup Steps

### 1. Open Supabase Dashboard
- Go to https://supabase.com
- Open your project: `wqwijeadpwbfhabcnfna`

### 2. Navigate to SQL Editor
- Click on **SQL Editor** in the left sidebar (database icon)
- Click **New Query**

### 3. Run the Schema Migration
- Open the file `supabase-environments-schema.sql` in this project
- Copy ALL the contents (entire file)
- Paste into the SQL Editor
- Click **Run** (or press Cmd/Ctrl + Enter)

### 4. Verify Tables Were Created
After running the SQL, you should see these new tables in your database:
- `environment_stocks`
- `environment_participants`
- `environment_positions`
- `environment_orders`
- `environment_trades`

And these columns added to the `markets` table:
- `description`
- `creator_id`
- `is_private`
- `password_hash`
- `starting_cash`
- `starting_shares`
- `min_price_change`
- `allow_shorting`
- `max_short_units`
- `is_paused`
- `pause_reason`

### 5. Test the Application
After running the migration:
1. Refresh your Angular app at http://localhost:4200
2. Try creating a new environment (public or private)
3. The environment features should now work!

## What This Migration Does

1. **Extends the `markets` table** to support environment settings
2. **Creates new tables** for:
   - Multiple stocks per environment
   - Participant tracking
   - Per-environment positions
   - Environment-specific orders and trades
3. **Sets up Row Level Security** for anonymous access (demo mode)
4. **Enables real-time subscriptions** for live updates

## Troubleshooting

If you still see errors after running the migration:
1. Check the SQL Editor for any error messages
2. Verify all tables were created by going to **Database** → **Tables**
3. Check the browser console for specific error messages
4. Make sure you're using the correct Supabase project URL in `environment.ts`
