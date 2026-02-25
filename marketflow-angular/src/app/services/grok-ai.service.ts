import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MarketContext {
  environmentId: string;
  stockSymbol: string;
  currentPrice?: number;
  recentTrades?: any[];
  orderBook?: {
    bids: any[];
    asks: any[];
  };
  userPosition?: {
    units: number;
    avgPrice: number;
  };
  userCash?: number;
}

export interface GrokAnalysisRequest {
  query: string;
  marketContext: MarketContext;
  analysisType: 'fundamental' | 'prediction' | 'order-advice' | 'general';
}

export interface GrokAnalysisResponse {
  success: boolean;
  analysis: string;
  suggestions?: {
    action?: 'buy' | 'sell' | 'hold';
    price?: number;
    units?: number;
    confidence?: number;
    reasoning?: string;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GrokAiService {
  private readonly grokApiUrl = environment.grokApiUrl || 'https://api.groq.com/openai/v1/chat/completions';
  private readonly grokApiKey = environment.grokApiKey || '';

  constructor(private http: HttpClient) {}

  /**
   * Analyze market with Grok AI
   */
  async analyzeMarket(request: GrokAnalysisRequest): Promise<GrokAnalysisResponse> {
    if (!this.grokApiKey) {
      return {
        success: false,
        analysis: '',
        error: 'Grok API key not configured. Please add GROK_API_KEY to environment.'
      };
    }

    try {
      const systemPrompt = this.buildSystemPrompt(request.analysisType);
      const userPrompt = this.buildUserPrompt(request);

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.grokApiKey}`
      });

      const body = {
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      };

      const response = await firstValueFrom(
        this.http.post<any>(this.grokApiUrl, body, { headers })
      );

      const analysisText = response.choices?.[0]?.message?.content || 'No analysis available';
      
      // Parse suggestions if order-advice type
      const suggestions = request.analysisType === 'order-advice' 
        ? this.parseSuggestions(analysisText)
        : undefined;

      return {
        success: true,
        analysis: analysisText,
        suggestions
      };
    } catch (error: any) {
      console.error('Grok API error:', error);
      return {
        success: false,
        analysis: '',
        error: `Failed to get analysis: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Build system prompt based on analysis type
   */
  private buildSystemPrompt(type: GrokAnalysisRequest['analysisType']): string {
    const basePrompt = `You are a financial market analyst assistant for MarketFlow, a trading simulation platform.
You provide insights, predictions, and advice based on market data.
ALWAYS respond concisely in plain text, using short bullet points or brief paragraphs.
NEVER use tables, markdown, or code blocks. Only include the most important, actionable insights.
Avoid verbose explanations, unnecessary details, and formatting that will not render well in a chat UI.`;

   switch (type) {
      case 'fundamental':
        return `${basePrompt}
Focus on fundamental analysis: assess the intrinsic value of assets based on market conditions, trading patterns, and historical data.
Summarize your answer in 2-4 short bullet points or a brief paragraph.`;

      case 'prediction':
        return `${basePrompt}
Focus on price prediction: analyze recent trades, order book depth, and market momentum to predict short-term price movements.
Be specific about expected price ranges and timeframes, but keep your answer concise and actionable.`;

      case 'order-advice':
        return `${basePrompt}
Focus on order recommendations: based on current market conditions, suggest specific trading actions.
Format your response EXACTLY as follows (no additional text or explanations):
ACTION: [BUY/SELL/HOLD]
PRICE: [suggested price as number only]
UNITS: [suggested quantity as number only]
CONFIDENCE: [0-100 as number only]
REASONING: [one or two concise sentences]`;

      case 'general':
      default:
        return `${basePrompt}
Provide helpful market analysis and answer questions about trading, market conditions, and strategies.
Keep your answer concise and focused on the most important points.`;
    }
  }

  /**
   * Build user prompt with market context
   */
  private buildUserPrompt(request: GrokAnalysisRequest): string {
    const { query, marketContext } = request;
    
    let prompt = `User Question: ${query}\n\n`;
    prompt += `Market Context:\n`;
    prompt += `- Environment: ${marketContext.environmentId}\n`;
    prompt += `- Stock: ${marketContext.stockSymbol}\n`;
    
    if (marketContext.currentPrice) {
      prompt += `- Current Price: $${marketContext.currentPrice.toFixed(2)}\n`;
    }

    if (marketContext.userPosition) {
      prompt += `- User Position: ${marketContext.userPosition.units} units @ avg $${marketContext.userPosition.avgPrice.toFixed(2)}\n`;
    }

    if (marketContext.userCash) {
      prompt += `- Available Cash: $${marketContext.userCash.toFixed(2)}\n`;
    }

    if (marketContext.recentTrades && marketContext.recentTrades.length > 0) {
      prompt += `\nRecent Trades (last ${marketContext.recentTrades.length}):\n`;
      marketContext.recentTrades.slice(0, 10).forEach((trade, i) => {
        prompt += `  ${i + 1}. ${trade.units} @ $${Number(trade.price).toFixed(2)}\n`;
      });
    }

    if (marketContext.orderBook) {
      const { bids, asks } = marketContext.orderBook;
      if (bids.length > 0) {
        prompt += `\nTop Bids:\n`;
        bids.slice(0, 5).forEach((bid, i) => {
          prompt += `  ${i + 1}. ${bid.units} @ $${Number(bid.price).toFixed(2)}\n`;
        });
      }
      if (asks.length > 0) {
        prompt += `\nTop Asks:\n`;
        asks.slice(0, 5).forEach((ask, i) => {
          prompt += `  ${i + 1}. ${ask.units} @ $${Number(ask.price).toFixed(2)}\n`;
        });
      }
    }

    return prompt;
  }

  /**
   * Parse order suggestions from AI response
   */
  private parseSuggestions(text: string): GrokAnalysisResponse['suggestions'] {
    const suggestions: GrokAnalysisResponse['suggestions'] = {};

    // Parse ACTION
    const actionMatch = text.match(/ACTION:\s*(BUY|SELL|HOLD)/i);
    if (actionMatch) {
      suggestions.action = actionMatch[1].toLowerCase() as 'buy' | 'sell' | 'hold';
    }

    // Parse PRICE
    const priceMatch = text.match(/PRICE:\s*\$?(\d+\.?\d*)/i);
    if (priceMatch) {
      suggestions.price = parseFloat(priceMatch[1]);
    }

    // Parse UNITS
    const unitsMatch = text.match(/UNITS:\s*(\d+)/i);
    if (unitsMatch) {
      suggestions.units = parseInt(unitsMatch[1], 10);
    }

    // Parse CONFIDENCE
    const confMatch = text.match(/CONFIDENCE:\s*(\d+)%?/i);
    if (confMatch) {
      suggestions.confidence = parseInt(confMatch[1], 10);
    }

    // Parse REASONING
    const reasoningMatch = text.match(/REASONING:\s*(.+?)(?=\n\n|\n[A-Z]+:|$)/is);
    if (reasoningMatch) {
      suggestions.reasoning = reasoningMatch[1].trim();
    }

    return Object.keys(suggestions).length > 0 ? suggestions : undefined;
  }
}
