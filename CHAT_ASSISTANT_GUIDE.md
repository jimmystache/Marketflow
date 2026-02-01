# Chat Assistant Guide

## Overview
The MarketFlow Chat Assistant is a lightweight, draggable chat interface that helps you execute trades and get information about your trading session using natural language commands.

## Features

### 🎯 Location & Interaction
- **Floating Button**: Located in the bottom-right corner by default
- **Draggable**: Click and drag the button to move it anywhere on the screen
- **Expandable**: Click the button to open the full chat interface
- **Always Available**: Appears on all pages when you're logged in

### 💬 Natural Language Commands

#### Setting Context (Required First)
Before trading, you need to set your context:
```
set environment [environment-id]
set participant [participant-id]
set stock [stock-id]
```

**Example:**
```
set environment abc123xyz
set participant part456def
set stock stock789ghi
```

The chat will display your current context at the top of the window.

#### Trading Commands

**Buy Orders:**
- `buy 10 shares at $50` - Buy 10 shares at $50 each
- `buy 5 at $25.50` - Buy 5 shares at $25.50 each
- `buy 20 at ask` - Buy 20 shares at current best ask price

**Sell Orders:**
- `sell 10 shares at $60` - Sell 10 shares at $60 each
- `sell 5 at $30` - Sell 5 shares at $30 each
- `sell 15 at bid` - Sell 15 shares at current best bid price

#### Information Commands

**Position Information:**
- `what's my position?` - View your current position in the selected stock
- `show my position` - Same as above

**Environment Information:**
- `show environment info` - View details about the current environment
- `env info` - Same as above

**Trading Statistics:**
- `what are my stats?` - View your trading statistics
- `show my stats` - View buy/sell trades and average prices
- `show trading stats` - Same as above

**Cash Balance:**
- `show cash balance` - View your available, settled, and total cash
- `what's my balance?` - Same as above

**Recent Trades:**
- `show recent trades` - View the last 5 trades in the current stock
- `show last trades` - Same as above

**Help:**
- `help` - Display all available commands

## How to Get IDs

### Environment ID
1. Navigate to the environment selection screen in the trading interface
2. The environment ID is shown in the environment list or URL

### Participant ID
1. Join an environment
2. Your participant ID is available in the browser console or can be provided by the system

### Stock ID
1. After joining an environment, the stock list shows available stocks
2. Stock IDs are displayed in the stock selection interface

## Tips

1. **Set Context Once**: You only need to set your environment, participant, and stock context once per session
2. **Context Display**: The chat header shows your current context (Env, User, Stock)
3. **Quick Trading**: Use "at ask" or "at bid" for instant market orders
4. **Draggable**: Move the chat button anywhere on screen for better visibility
5. **Persistent**: The chat remains accessible across all pages while logged in

## Example Session

```
User: set environment abc123
Assistant: ✓ Environment set: Demo Trading (DEMO)

User: set participant part456
Assistant: ✓ Participant set: john_trader

User: set stock stock789
Assistant: ✓ Stock set: AAPL - Apple Inc.

User: what's my position?
Assistant: 📊 Position in AAPL:
Units: 50
Avg Price: $150.00
Total Value: $7500.00

User: buy 10 at $155
Assistant: ✓ Buy order placed: 10 shares @ $155.00

User: show my stats
Assistant: 📈 Trading Stats:
Total Trades: 3
Buy Trades: 2 (30 units @ avg $152.50)
Sell Trades: 1 (10 units @ avg $160.00)
```

## Troubleshooting

**"Please set environment first"**
- You need to set your environment context before trading

**"No ask/bid price available"**
- There are no active orders on the other side of the market
- Try placing a limit order with a specific price instead

**"Failed to place order"**
- Check if the environment is paused
- Verify you have sufficient cash or shares
- Ensure the price meets minimum increment requirements

## Future Enhancements
- Voice input support
- Order cancellation commands
- Chart/graph requests
- Portfolio analysis
- Custom alerts and notifications
