# Chat Assistant - Dual Mode Feature

## Overview
The MarketFlow chat assistant now supports two distinct modes:
1. **Command Mode** - Execute trades, manage positions, and run bot simulations
2. **Analysis Mode** - Get AI-powered market insights, predictions, and trading advice using Grok Cloud

## Features

### Command Mode (⚡)
Execute trading commands and manage your portfolio:
- **Trading**: `buy 10 at $50`, `sell 5 at bid`, `buy 5 at ask`
- **Position Info**: `what's my position?`, `show my stats`
- **Environment**: `show environment info`
- **Bot Simulation**: Use quick action buttons (Normal, High, Extreme) or commands

### Analysis Mode (🧠)
Get AI-powered market analysis and advice powered by Grok:
- **Market Trends**: "What's the market trend?", "Analyze current market conditions"
- **Price Predictions**: "Predict price movement", "Where is the price going?"
- **Trading Advice**: "Should I buy now?", "What's your recommendation?"
- **Fundamental Analysis**: "What's the fair value?", "Analyze fundamentals"

## Setup

### 1. Get Grok API Key
1. Visit [https://console.x.ai/](https://console.x.ai/)
2. Sign up or log in
3. Create an API key
4. Copy your API key

### 2. Configure Environment
Open `src/environments/environment.ts` and add your Grok API key:

```typescript
export const environment = {
  production: false,
  supabase: { ... },
  grokApiUrl: 'https://api.x.ai/v1/chat/completions',
  grokApiKey: 'YOUR_GROK_API_KEY_HERE' // Add your key here
};
```

## How It Works

### Analysis Mode Architecture
1. **User asks a question** in Analysis Mode
2. **Market context is gathered**:
   - Recent trades (last 20)
   - Order book (top 10 bids/asks)
   - User position and cash
   - Current price
3. **Query is sent to Grok** with context
4. **AI analyzes** and provides:
   - Market insights
   - Price predictions
   - Order recommendations (with confidence scores)
5. **Response is displayed** in the chat

### Analysis Types
The system automatically detects the type of analysis based on your question:
- **Order Advice**: Questions with "should I", "recommend", "buy or sell"
- **Prediction**: Questions with "predict", "forecast", "price will"
- **Fundamental**: Questions with "value", "fundamental", "worth"
- **General**: All other market-related questions

### Real-Time Data Integration
Analysis Mode uses real-time data from your Supabase backend:
- Live order book depth
- Recent transaction history
- Current user positions
- Available cash

## Usage Examples

### Analysis Mode Examples

**Market Trend Analysis:**
```
User: "What's the market trend for this stock?"
AI: Analyzes recent trades, volume, and price action to identify trends
```

**Price Prediction:**
```
User: "Where do you think the price will go in the next few minutes?"
AI: Uses order book depth and recent momentum to predict short-term movement
```

**Trading Advice:**
```
User: "Should I buy now or wait?"
AI Response:
ACTION: BUY
PRICE: $99.50
UNITS: 10
CONFIDENCE: 75%
REASONING: Strong buy pressure in order book, recent uptrend...
```

**Fundamental Analysis:**
```
User: "What's the fair value of this stock?"
AI: Analyzes trading patterns and market depth to estimate value
```

## Technical Implementation

### New Components
1. **GrokAiService** (`src/app/services/grok-ai.service.ts`)
   - Handles all Grok Cloud API communication
   - Formats market context for AI analysis
   - Parses AI responses and suggestions

2. **Mode Toggle UI** (in chat-assistant)
   - Visual toggle between Command/Analysis modes
   - Mode-specific welcome messages
   - Context-aware quick actions

3. **Market Context Builder**
   - Aggregates real-time market data
   - Formats data for AI consumption
   - Handles data fetch errors gracefully

### API Integration
- **Endpoint**: `https://api.x.ai/v1/chat/completions`
- **Model**: `grok-beta`
- **Temperature**: 0.7 (balanced creativity/consistency)
- **Max Tokens**: 1000

### Data Flow
```
User Query → Mode Router → Analysis Handler → Market Context Builder
     ↓
Grok API ← Context + Query
     ↓
AI Response → Suggestion Parser → Chat Display
```

## Security & Privacy

### Best Practices
- **API Key**: Store in environment variables, never commit to version control
- **Data Minimization**: Only recent trades and relevant context sent to Grok
- **User Control**: Users can switch modes anytime
- **Error Handling**: Graceful fallback if Grok API is unavailable

### Environment Variables
For production, use environment-specific configuration:
- Development: `environment.ts`
- Production: `environment.prod.ts`

## Future Enhancements

### Potential Additions
1. **Advanced Predictions**: Multi-timeframe analysis
2. **Risk Assessment**: Portfolio risk scoring
3. **Automated Strategies**: AI-suggested trading strategies
4. **Historical Analysis**: Compare current conditions to historical patterns
5. **Multi-Asset Analysis**: Cross-stock comparisons
6. **Sentiment Analysis**: News/social media integration

### Performance Optimizations
- Cache recent market context to reduce API calls
- Implement request debouncing
- Add response streaming for long analyses

## Troubleshooting

### Common Issues

**"Grok API key not configured"**
- Solution: Add your API key to `environment.ts`

**"Please navigate to trading page first"**
- Solution: Analysis requires market context. Visit the trading page to set environment/stock.

**API Rate Limits**
- Grok Cloud has rate limits. Implement exponential backoff if needed.

**Slow Responses**
- First API call may be slower. Subsequent calls are typically faster.
- Consider showing a loading indicator for user feedback.

## Cost Considerations

Grok API usage is billed per token. To optimize costs:
- Limit market context size (already implemented)
- Cache responses for identical queries
- Implement query batching if possible
- Monitor API usage via Grok console

## Support

For issues or questions:
1. Check the Angular console for errors
2. Verify Grok API key is valid
3. Check network tab for API call failures
4. Review Grok API documentation: [https://docs.x.ai/](https://docs.x.ai/)

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Dependencies**: Angular 17+, Grok Cloud API, Supabase
