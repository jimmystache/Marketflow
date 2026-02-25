import { Component, OnInit, OnDestroy, ElementRef, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { 
  SupabaseService, 
  DbTradingEnvironment,
  DbEnvironmentParticipant,
  DbEnvironmentStock,
  DbEnvironmentTrade,
  DbEnvironmentPosition 
} from '../../services/supabase.service';
import { TradingContextService } from '../../services/trading-context.service';
import { OrderExecutionService } from '../../services/order-execution.service';
import { BotSimulationService } from '../../services/bot-simulation.service';
import { GrokAiService, MarketContext } from '../../services/grok-ai.service';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface PendingOrder {
  type: 'buy' | 'sell';
  units: number;
  price: number;
}

@Component({
  selector: 'app-chat-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-assistant.html',
  styleUrls: ['./chat-assistant.css']
})
export class ChatAssistant implements OnInit, OnDestroy {
  isExpanded = false;
  private globalClickUnlisten: (() => void) | null = null;
  messages: ChatMessage[] = [];
  userInput = '';
  
  // Mode: command or analysis
  currentMode: 'command' | 'analysis' = 'command';
  
  // Menu state
  menuOpen = false;
  
  // Current environment context
  currentEnvironment: DbTradingEnvironment | null = null;
  currentParticipant: DbEnvironmentParticipant | null = null;
  currentStock: DbEnvironmentStock | null = null;
  
  // Trading data
  recentTrades: DbEnvironmentTrade[] = [];
  positions: DbEnvironmentPosition[] = [];
  // Pending order waiting confirmation
  pendingOrder: PendingOrder | null = null;
  
  // Bot simulation state
  botSimulationRunning = false;
  private botSimulationTimeout: any = null;
  
  // Order execution state
  isExecutingOrder = false;
  
  // Subscription to trading context
  private contextSubscription?: Subscription;
  private tradesSubscription?: Subscription;

  constructor(
    private supabaseService: SupabaseService,
    private tradingContextService: TradingContextService,
    private orderExecutionService: OrderExecutionService,
    private elRef: ElementRef,
    private renderer: Renderer2,
    private botSimulationService: BotSimulationService,
    private grokAiService: GrokAiService
  ) {}


  ngOnInit(): void {
     const welcome = `<b>Hey!</b> I can help you trade and analyze markets.<br>
      <b>🔷 Command Mode:</b> Execute trades, manage positions, run bot simulations<br>
      <b>🔷 Analysis Mode:</b> Get AI-powered market insights, predictions, and advice<br>
        <b>Command:</b> buy 10 at $50, what's my position, run bot simulation<br>
      <b>Analysis:</b> what's the market trend?, should I buy now?, predict price movement<br>
      <b>For commands :</b> type 'help'
  `;
    this.addMessage(welcome, 'assistant');
    
    // Subscribe to trading context changes
    this.contextSubscription = this.tradingContextService.context$.subscribe(async (context) => {
      if (context.environmentId && context.participantId && context.stockId) {
        // Auto-load context when available
        await this.loadContextFromIds(
          context.environmentId,
          context.participantId,
          context.stockId
        );
      } else {
        // Clear context if not all IDs are available
        if (!context.environmentId) this.currentEnvironment = null;
        if (!context.participantId) this.currentParticipant = null;
        if (!context.stockId) this.currentStock = null;
      }
    });
  }

  ngOnDestroy(): void {
    // Cleanup subscriptions
    if (this.contextSubscription) {
      this.contextSubscription.unsubscribe();
    }
    if (this.tradesSubscription) {
      this.tradesSubscription.unsubscribe();
    }
    if (this.globalClickUnlisten) {
      this.globalClickUnlisten();
      this.globalClickUnlisten = null;
    }
    // Stop any running bot simulation
    this.botSimulationService.stopSimulation();
  }
  
  /**
   * Load context from IDs automatically
   */
  async loadContextFromIds(envId: string, partId: string, stockId: string): Promise<void> {
    // Load environment
    if (!this.currentEnvironment || this.currentEnvironment.id !== envId) {
      this.currentEnvironment = await this.supabaseService.getTradingEnvironment(envId);
    }
    
    // Load participant
    if (!this.currentParticipant || this.currentParticipant.id !== partId) {
      this.currentParticipant = await this.supabaseService.getParticipantById(partId);
      if (this.currentParticipant && this.currentEnvironment) {
        this.positions = await this.supabaseService.getParticipantPositions(
          this.currentEnvironment.id,
          partId
        );
      }
    }
    
    // Load stock
    if (!this.currentStock || this.currentStock.id !== stockId) {
      this.currentStock = await this.supabaseService.getEnvironmentStock(stockId);
    }
    
    // Load recent trades for analysis context (frontend state)
    if (this.currentEnvironment && this.currentStock) {
      this.recentTrades = await this.supabaseService.getEnvironmentTrades(
        this.currentEnvironment.id,
        this.currentStock.id,
        50 // Get more trades for better AI context
      );
      
      // Subscribe to real-time trade updates for live context
      this.subscribeToTradeUpdates(this.currentEnvironment.id, this.currentStock.id);
    }
  }
  
  /**
   * Subscribe to real-time trade updates to keep recentTrades fresh
   */
  private subscribeToTradeUpdates(envId: string, stockId: string): void {
    // Unsubscribe from previous subscription if any
    if (this.tradesSubscription) {
      this.tradesSubscription.unsubscribe();
    }
    
    // Subscribe to envTrades$ observable from SupabaseService
    this.tradesSubscription = this.supabaseService.envTrades$.subscribe((trades) => {
      // Filter for current stock and keep the most recent 50
      this.recentTrades = trades
        .filter(t => t.stock_id === stockId)
        .slice(0, 50);
    });
  }

  /**
   * Toggle chat expansion
   */
  toggleChat(): void {
    if (this.isExpanded) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  openChat(): void {
    this.isExpanded = true;
    // Listen for clicks outside
    if (!this.globalClickUnlisten) {
      this.globalClickUnlisten = this.renderer.listen('document', 'mousedown', (event: MouseEvent) => {
        if (this.isExpanded && !this.elRef.nativeElement.contains(event.target)) {
          this.closeChat();
        }
      });
    }
    // Ensure latest messages are visible after opening (DOM created)
    setTimeout(() => this.scrollToBottom(), 100);
  }

  closeChat(): void {
    this.isExpanded = false;
    this.menuOpen = false;
    if (this.globalClickUnlisten) {
      this.globalClickUnlisten();
      this.globalClickUnlisten = null;
    }
  }

  /**
   * Toggle the extended menu
   */
  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  /**
   * Add a message to the chat
   */
  addMessage(text: string, sender: 'user' | 'assistant'): void {
    if (sender === 'assistant' && text.length > 0 && this.currentMode === 'analysis') {
      // Typewriter effect for assistant
      const id = Date.now().toString() + Math.random();
      const message: ChatMessage = {
        id,
        text: '',
        sender,
        timestamp: new Date()
      };
      this.messages.push(message);
      let i = 0;
      const typeSpeed = 18; 
      const typeNext = () => {
        if (i <= text.length) {
          message.text = text.slice(0, i);
          i++;
          setTimeout(typeNext, typeSpeed);
          if (i % 4 === 0) setTimeout(() => this.scrollToBottom(), 0);
        } else {
          setTimeout(() => this.scrollToBottom(), 0);
        }
      };
      typeNext();
    } else {
      // User or empty/instant message
      this.messages.push({
        id: Date.now().toString() + Math.random(),
        text,
        sender,
        timestamp: new Date()
      });
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  /**
   * Scroll chat body to the bottom (latest messages)
   */
  private scrollToBottom(): void {
    try {
      const host = this.elRef && this.elRef.nativeElement ? this.elRef.nativeElement : document;
      const chatBody = host.querySelector?.('.chat-body') ?? document.querySelector('.chat-body');
      if (chatBody) {
        chatBody.scrollTop = chatBody.scrollHeight;
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Send user message and process command
   */
  async sendMessage(): Promise<void> {
    if (!this.userInput.trim()) return;

    const input = this.userInput.trim();
    this.addMessage(input, 'user');
    this.userInput = '';

    // Route to appropriate handler based on mode
    if (this.currentMode === 'command') {
      await this.processCommand(input);
    } else {
      await this.processAnalysisQuery(input);
    }
  }

  /**
   * Switch between command and analysis modes
   */
  switchMode(mode: 'command' | 'analysis'): void {
    this.currentMode = mode;
    if (mode === 'command') {
      this.addMessage('Switched to Command Mode. You can now execute trades and manage positions.', 'assistant');
    } else {
      this.addMessage('Switched to Analysis Mode. Ask me about market trends, predictions, or get trading advice.', 'assistant');
    }
  }

  /**
   * Process analysis query using Grok AI
   */
  async processAnalysisQuery(query: string): Promise<void> {
    if (!this.currentEnvironment || !this.currentStock) {
      this.addMessage('⚠️ Please navigate to the trading page first to set your environment and stock context.', 'assistant');
      return;
    }

    this.addMessage('🤔 Analyzing market data...', 'assistant');

    try {
      // Gather market context
      const marketContext = await this.buildMarketContext();

      // Determine analysis type based on query
      const analysisType = this.detectAnalysisType(query);

      // Call Grok AI service
      const response = await this.grokAiService.analyzeMarket({
        query,
        marketContext,
        analysisType
      });

      if (response.success) {
        // If order advice with suggestions, only show formatted version
        if (response.suggestions && response.suggestions.action) {
          const { action, price, units, confidence, reasoning } = response.suggestions;
          const suggestionText = `${action.toUpperCase()}: ${units || 'N/A'} shares @ $${price?.toFixed(2) || 'market'}\nConfidence: ${confidence || 'N/A'}%\n\n${reasoning || ''}`;
          this.addMessage(suggestionText, 'assistant');
        } else {
          // For other analysis types, show the raw analysis
          this.addMessage(response.analysis, 'assistant');
        }
      } else {
        this.addMessage(`❌ ${response.error}`, 'assistant');
      }
    } catch (error: any) {
      this.addMessage(`❌ Analysis failed: ${error.message}`, 'assistant');
    }
  }

  /**
   * Build market context for AI analysis
   * Uses frontend state from trading context for real-time accuracy
   */
  private async buildMarketContext(): Promise<MarketContext> {
    const context: MarketContext = {
      environmentId: this.currentEnvironment!.id,
      stockSymbol: this.currentStock!.symbol
    };

    // Use frontend state from recentTrades (already loaded from trading component)
    if (this.recentTrades && this.recentTrades.length > 0) {
      context.recentTrades = this.recentTrades.slice(0, 20);
      context.currentPrice = Number(this.recentTrades[0].price);
    } else {
      // Fallback: fetch from DB if frontend state is not yet populated
      try {
        const trades = await this.supabaseService.getEnvironmentTrades(
          this.currentEnvironment!.id,
          this.currentStock!.id,
          20
        );
        if (trades.length > 0) {
          context.recentTrades = trades;
          context.currentPrice = Number(trades[0].price);
        }
      } catch (error) {
        console.error('Failed to fetch trades:', error);
      }
    }

    // Get order book from frontend state (live and accurate)
    try {
      const orders = await this.supabaseService.getEnvironmentOpenOrders(
        this.currentEnvironment!.id,
        this.currentStock!.id
      );
      
      if (orders.length > 0) {
        const bids = orders
          .filter(o => o.type === 'buy')
          .sort((a, b) => Number(b.price) - Number(a.price))
          .slice(0, 10);
        const asks = orders
          .filter(o => o.type === 'sell')
          .sort((a, b) => Number(a.price) - Number(b.price))
          .slice(0, 10);
        
        context.orderBook = { bids, asks };
      }
    } catch (error) {
      console.error('Failed to fetch order book:', error);
    }

    // Get user position from frontend state (positions array)
    if (this.currentParticipant) {
      const position = this.positions.find(p => p.stock_id === this.currentStock!.id);
      if (position) {
        context.userPosition = {
          units: Number(position.units),
          avgPrice: Number(position.avg_price)
        };
      }

      context.userCash = Number(this.currentParticipant.available_cash);
    }

    return context;
  }

  /**
   * Detect analysis type from query
   */
  private detectAnalysisType(query: string): 'fundamental' | 'prediction' | 'order-advice' | 'general' {
    const lower = query.toLowerCase();
    
    if (lower.includes('should i') || lower.includes('recommend') || lower.includes('advice') || 
        lower.includes('buy or sell') || lower.includes('what should')) {
      return 'order-advice';
    }
    
    if (lower.includes('predict') || lower.includes('forecast') || lower.includes('price will') ||
        lower.includes('where is') || lower.includes('going to')) {
      return 'prediction';
    }
    
    if (lower.includes('value') || lower.includes('fundamental') || lower.includes('worth') ||
        lower.includes('fair price')) {
      return 'fundamental';
    }
    
    return 'general';
  }

  /**
   * Process natural language command
   */
  async processCommand(input: string): Promise<void> {
    const lower = input.toLowerCase();

    try {
      // Set context commands
      if (lower.includes('set environment') || lower.includes('use environment')) {
        const envId = this.extractId(input);
        if (envId) {
          await this.setEnvironment(envId);
        } else {
          this.addMessage('Please provide an environment ID. Example: "set environment abc123"', 'assistant');
        }
        return;
      }

      if (lower.includes('set participant') || lower.includes('use participant')) {
        const partId = this.extractId(input);
        if (partId) {
          await this.setParticipant(partId);
        } else {
          this.addMessage('Please provide a participant ID. Example: "set participant xyz789"', 'assistant');
        }
        return;
      }

      if (lower.includes('set stock') || lower.includes('use stock')) {
        const stockId = this.extractId(input);
        if (stockId) {
          await this.setStock(stockId);
        } else {
          this.addMessage('Please provide a stock ID. Example: "set stock stock123"', 'assistant');
        }
        return;
      }

      // Check if context is set for trading commands
      if (!this.currentEnvironment || !this.currentParticipant || !this.currentStock) {
        if (lower.includes('buy') || lower.includes('sell')) {
          this.addMessage('Please set your environment, participant, and stock first using commands like "set environment [id]"', 'assistant');
          return;
        }
      }

      // Buy commands
      if (lower.includes('buy')) {
        await this.handleBuyCommand(input);
        return;
      }

      // Sell commands
      if (lower.includes('sell')) {
        await this.handleSellCommand(input);
        return;
      }

      // Info commands
      if (lower.includes('position') || lower.includes('my shares')) {
        await this.showPosition();
        return;
      }

      if (lower.includes('environment info') || lower.includes('env info')) {
        await this.showEnvironmentInfo();
        return;
      }

      if (lower.includes('stats') || lower.includes('my stats') || lower.includes('trading stats')) {
        await this.showTradingStats();
        return;
      }

      if (lower.includes('cash') || lower.includes('balance')) {
        await this.showCashBalance();
        return;
      }

      if (lower.includes('recent trades') || lower.includes('last trades')) {
        await this.showRecentTrades();
        return;
      }

      if (lower.includes('help')) {
        this.showHelp();
        return;
      }

      // Bot simulation commands
      if (lower.includes('bot') && (lower.includes('sim') || lower.includes('run'))) {
        await this.handleBotSimulation(input);
        return;
      }

      // Default response
      this.addMessage('I didn\'t understand that command. Type "help" to see available commands.', 'assistant');

    } catch (error: any) {
      this.addMessage(`Error: ${error.message || 'Something went wrong'}`, 'assistant');
    }
  }

  /**
   * Extract ID from input string
   */
  extractId(input: string): string | null {
    const words = input.split(' ');
    const lastWord = words[words.length - 1];
    return lastWord && lastWord.length > 5 ? lastWord : null;
  }

  /**
   * Extract number from input
   */
  extractNumber(input: string, keyword: string): number | null {
    const regex = new RegExp(`${keyword}\\s+(\\d+\\.?\\d*)`, 'i');
    const match = input.match(regex);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Set current environment context
   */
  async setEnvironment(envId: string): Promise<void> {
    const env = await this.supabaseService.getTradingEnvironment(envId);
    if (env) {
      this.currentEnvironment = env;
      this.addMessage(`✓ Environment set: ${env.name} (${env.symbol})`, 'assistant');
    } else {
      this.addMessage('❌ Environment not found', 'assistant');
    }
  }

  /**
   * Set current participant context
   */
  async setParticipant(partId: string): Promise<void> {
    if (!this.currentEnvironment) {
      this.addMessage('Please set environment first', 'assistant');
      return;
    }
    
    const participant = await this.supabaseService.getParticipantById(partId);
    if (participant) {
      this.currentParticipant = participant;
      const username = participant.trader?.username || 'Unknown';
      this.addMessage(`✓ Participant set: ${username}`, 'assistant');
      
      // Load positions
      this.positions = await this.supabaseService.getParticipantPositions(
        this.currentEnvironment.id,
        partId
      );
    } else {
      this.addMessage('❌ Participant not found', 'assistant');
    }
  }

  /**
   * Set current stock context
   */
  async setStock(stockId: string): Promise<void> {
    if (!this.currentEnvironment) {
      this.addMessage('Please set environment first', 'assistant');
      return;
    }
    
    const stock = await this.supabaseService.getEnvironmentStock(stockId);
    if (stock && stock.market_id === this.currentEnvironment.id) {
      this.currentStock = stock;
      this.addMessage(`✓ Stock set: ${stock.symbol} - ${stock.name}`, 'assistant');
    } else {
      this.addMessage('❌ Stock not found in current environment', 'assistant');
    }
  }

  /**
   * Handle buy command
   */
  async handleBuyCommand(input: string): Promise<void> {
    if (!this.validateContext()) return;

    // Prevent creating new orders while one is executing
    if (this.isExecutingOrder) {
      this.addMessage('Please wait for the current order to complete.', 'assistant');
      return;
    }

    // Warn if there's already a pending order
    if (this.pendingOrder) {
      this.addMessage('You already have a pending order. Please confirm or cancel it first.', 'assistant');
      return;
    }

    const units = this.extractNumber(input, 'buy') || this.extractNumber(input, '');
    let price: number | null = null;

    if (input.includes('at ask') || input.includes('@ ask')) {
      // Buy at current ask price
      const orders = await this.supabaseService.getEnvironmentOrders(
        this.currentEnvironment!.id,
        this.currentStock!.id
      );
      const asks = orders
        .filter(o => o.type === 'sell' && (o.status === 'open' || o.status === 'partial'))
        .map(o => Number(o.price))
        .sort((a, b) => a - b);
      
      price = asks.length > 0 ? asks[0] : null;
      if (!price) {
        this.addMessage('No ask price available', 'assistant');
        return;
      }
    } else if (input.includes('at') || input.includes('@')) {
      price = this.extractNumber(input, 'at') || this.extractNumber(input, '@');
    }

    if (!units || units <= 0) {
      this.addMessage('Please specify a valid quantity. Example: "buy 10 shares at $50"', 'assistant');
      return;
    }

    if (!price || price <= 0) {
      this.addMessage('Please specify a valid price. Example: "buy 10 at $50" or "buy 10 at ask"', 'assistant');
      return;
    }

    // Set pending order for user confirmation
    this.pendingOrder = { type: 'buy', units, price };
    this.addMessage(`Pending buy order: ${units} shares @ $${price.toFixed(2)} — click Confirm or Cancel.`, 'assistant');
  }

  /**
   * Handle sell command
   */
  async handleSellCommand(input: string): Promise<void> {
    if (!this.validateContext()) return;

    // Prevent creating new orders while one is executing
    if (this.isExecutingOrder) {
      this.addMessage('Please wait for the current order to complete.', 'assistant');
      return;
    }

    // Warn if there's already a pending order
    if (this.pendingOrder) {
      this.addMessage('You already have a pending order. Please confirm or cancel it first.', 'assistant');
      return;
    }

    const units = this.extractNumber(input, 'sell') || this.extractNumber(input, '');
    let price: number | null = null;

    if (input.includes('at bid') || input.includes('@ bid')) {
      // Sell at current bid price
      const orders = await this.supabaseService.getEnvironmentOrders(
        this.currentEnvironment!.id,
        this.currentStock!.id
      );
      const bids = orders
        .filter(o => o.type === 'buy' && (o.status === 'open' || o.status === 'partial'))
        .map(o => Number(o.price))
        .sort((a, b) => b - a);
      
      price = bids.length > 0 ? bids[0] : null;
      if (!price) {
        this.addMessage('No bid price available', 'assistant');
        return;
      }
    } else if (input.includes('at') || input.includes('@')) {
      price = this.extractNumber(input, 'at') || this.extractNumber(input, '@');
    }

    if (!units || units <= 0) {
      this.addMessage('Please specify a valid quantity. Example: "sell 10 shares at $50"', 'assistant');
      return;
    }

    if (!price || price <= 0) {
      this.addMessage('Please specify a valid price. Example: "sell 10 at $50" or "sell 10 at bid"', 'assistant');
      return;
    }

    // Set pending order for user confirmation
    this.pendingOrder = { type: 'sell', units, price };
    this.addMessage(`Pending sell order: ${units} shares @ $${price.toFixed(2)} — click Confirm or Cancel.`, 'assistant');
  }

  /**
   * Confirm the pending order and execute it
   */
  async confirmPending(): Promise<void> {
    // Prevent multiple simultaneous executions
    if (this.isExecutingOrder) {
      console.warn('Order execution already in progress');
      return;
    }

    if (!this.pendingOrder || !this.validateContext()) {
      this.pendingOrder = null;
      return;
    }

    // Store order details and clear pending order immediately to prevent re-execution
    const { type, units, price } = this.pendingOrder;
    this.pendingOrder = null;
    this.isExecutingOrder = true;

    try {
      this.addMessage(`Executing ${type} order: ${units} @ $${price.toFixed(2)}...`, 'assistant');

      const result = await this.orderExecutionService.placeAndExecuteOrder(
        this.currentEnvironment!.id,
        this.currentParticipant!.id,
        this.currentStock!.id,
        type,
        price,
        units
      );

      if (result.success) {
        let message = `✓ ${result.message}`;
        if (result.tradesExecuted && result.tradesExecuted > 0) {
          message += `\n${result.tradesExecuted} trade(s) executed immediately.`;
        }
        this.addMessage(message, 'assistant');

        // Reload context data
        await this.loadContextFromIds(
          this.currentEnvironment!.id,
          this.currentParticipant!.id,
          this.currentStock!.id
        );
      } else {
        this.addMessage(`❌ ${result.message}`, 'assistant');
      }
    } catch (error: any) {
      console.error('Error executing order:', error);
      this.addMessage(`❌ Failed to execute order: ${error.message || 'Unknown error'}`, 'assistant');
    } finally {
      // Always clear execution state
      this.isExecutingOrder = false;
    }
  }

  /**
   * Cancel the pending order
   */
  cancelPending(): void {
    if (!this.pendingOrder && !this.isExecutingOrder) return;
    
    if (this.isExecutingOrder) {
      this.addMessage('Cannot cancel - order is currently being executed.', 'assistant');
      return;
    }
    
    this.addMessage('Pending order cancelled.', 'assistant');
    this.pendingOrder = null;
  }

  /**
   * Show current position
   */
  async showPosition(): Promise<void> {
    if (!this.validateContext()) return;

    if (this.positions.length === 0) {
      this.positions = await this.supabaseService.getParticipantPositions(
        this.currentEnvironment!.id,
        this.currentParticipant!.id
      );
    }

    const position = this.positions.find(p => p.stock_id === this.currentStock!.id);
    
    if (position) {
      const avgPrice = Number(position.avg_price);
      const units = position.units;
      this.addMessage(
        `📊 Position in ${this.currentStock!.symbol}:\n` +
        `Units: ${units}\n` +
        `Avg Price: $${avgPrice.toFixed(2)}\n` +
        `Total Value: $${(units * avgPrice).toFixed(2)}`,
        'assistant'
      );
    } else {
      this.addMessage(`No position in ${this.currentStock!.symbol}`, 'assistant');
    }
  }

  /**
   * Show environment information
   */
  async showEnvironmentInfo(): Promise<void> {
    if (!this.currentEnvironment) {
      this.addMessage('No environment selected. Use "set environment [id]"', 'assistant');
      return;
    }

    const env = this.currentEnvironment;

    // Only show the selected stock symbol (from environment_stocks) to match the chat header
    if (this.currentStock) {
      const stock = await this.supabaseService.getEnvironmentStock(this.currentStock.id);
      const symbol = stock ? stock.symbol : this.currentStock.symbol;
      this.addMessage(`🌍 ${env.name}\nStock: ${symbol}`, 'assistant');
    } else {
      // If no stock selected, fall back to environment symbol
      this.addMessage(`🌍 ${env.name}\nSymbol: ${env.symbol}`, 'assistant');
    }
  }

  /**
   * Show trading stats
   */
  async showTradingStats(): Promise<void> {
    if (!this.validateContext()) return;

    // Get participant's trades
    const trades = await this.supabaseService.getParticipantTrades(
      this.currentEnvironment!.id,
      this.currentParticipant!.id
    );

    const buyTrades = trades.filter(t => t.buyer_participant_id === this.currentParticipant!.id);
    const sellTrades = trades.filter(t => t.seller_participant_id === this.currentParticipant!.id);

    const totalBought = buyTrades.reduce((sum, t) => sum + t.units, 0);
    const totalSold = sellTrades.reduce((sum, t) => sum + t.units, 0);
    const avgBuyPrice = buyTrades.length > 0 
      ? buyTrades.reduce((sum, t) => sum + (Number(t.price) * t.units), 0) / totalBought
      : 0;
    const avgSellPrice = sellTrades.length > 0
      ? sellTrades.reduce((sum, t) => sum + (Number(t.price) * t.units), 0) / totalSold
      : 0;

    this.addMessage(
      `📈 Trading Stats:\n` +
      `Total Trades: ${trades.length}\n` +
      `Buy Trades: ${buyTrades.length} (${totalBought} units @ avg $${avgBuyPrice.toFixed(2)})\n` +
      `Sell Trades: ${sellTrades.length} (${totalSold} units @ avg $${avgSellPrice.toFixed(2)})`,
      'assistant'
    );
  }

  /**
   * Show cash balance
   */
  async showCashBalance(): Promise<void> {
    if (!this.currentParticipant) {
      this.addMessage('No participant selected. Use "set participant [id]"', 'assistant');
      return;
    }

    this.addMessage(
      `💰 Cash Balance:\n` +
      `Available: $${this.currentParticipant.available_cash.toFixed(2)}\n` +
      `Settled: $${this.currentParticipant.settled_cash.toFixed(2)}\n` +
      `Total: $${this.currentParticipant.cash.toFixed(2)}`,
      'assistant'
    );
  }

  /**
   * Show recent trades
   */
  async showRecentTrades(): Promise<void> {
    if (!this.validateContext()) return;

    const trades = await this.supabaseService.getEnvironmentTrades(
      this.currentEnvironment!.id,
      this.currentStock!.id,
      10
    );

    if (trades.length === 0) {
      this.addMessage('No recent trades', 'assistant');
      return;
    }

    let message = `📊 Recent Trades (${this.currentStock!.symbol}):\n`;
    trades.slice(0, 5).forEach((trade, idx) => {
      message += `${idx + 1}. ${trade.units} @ $${Number(trade.price).toFixed(2)}\n`;
    });

    this.addMessage(message, 'assistant');
  }

  /**
   * Show help message
   */
  showHelp(): void {
    const hasContext = this.currentEnvironment && this.currentParticipant && this.currentStock;
    const contextNote = hasContext 
      ? '✓ Context auto-detected from trading page\n\n' 
      : '⚠️ Context not detected. Use "set" commands or navigate to trading page.\n\n';
    
    this.addMessage(
      '🤖 Available Commands:\n' +
      'Trading:\n' +
      '• buy [quantity] at $[price]\n' +
      '• buy [quantity] at ask\n' +
      '• sell [quantity] at $[price]\n' +
      '• sell [quantity] at bid\n\n' +
      'Bot Simulations:\n' +
      '• run bot simulation high for 30 seconds\n' +
      '• run bot simulation extreme for 2 minutes\n' +
      '• Or use quick action buttons above\n\n' +
      'Information:\n' +
      '• what\'s my position?\n' +
      '• what are my stats?\n' +
      '• show cash balance\n' +
      '• show recent trades',
      'assistant'
    );
  }

  /**
   * Handle bot simulation command
   */
  async handleBotSimulation(input: string): Promise<void> {
    if (!this.validateContext()) return;

    const lower = input.toLowerCase();
    let volatility: 'high' | 'extreme' = 'high';
    let duration = 30; // default 30 seconds

    // Parse volatility
    if (lower.includes('extreme')) {
      volatility = 'extreme';
    } else if (lower.includes('high')) {
      volatility = 'high';
    }

    // Parse duration
    const durationMatch = input.match(/(\d+)\s*(sec|second|min|minute)/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      if (unit.startsWith('min')) {
        duration = value * 60;
      } else {
        duration = value;
      }
    }

    await this.runBotSimulation(volatility, duration);
  }

  /**
   * Run bot simulation with specified volatility and duration
   */
  async runBotSimulation(volatility: 'normal' | 'high' | 'extreme', duration: number): Promise<void> {
    if (this.botSimulationRunning) {
      this.addMessage('❌ Bot simulation is already running. Please wait for it to complete.', 'assistant');
      return;
    }

    if (!this.currentEnvironment || !this.currentStock) {
      this.addMessage('❌ Missing environment or stock context', 'assistant');
      return;
    }

    this.botSimulationRunning = true;
    const volatilityLabel = volatility === 'extreme' ? '🔥 EXTREME' : volatility === 'high' ? '⚡ HIGH' : '⚪ NORMAL';
    this.addMessage(
      `🤖 Starting bot simulation...\n${volatilityLabel} volatility for ${duration} seconds\nEnvironment: ${this.currentEnvironment.name}\nStock: ${this.currentStock.symbol}`,
      'assistant'
    );

    try {
      // Call the demo-bots script via a backend endpoint or execute directly
      // For now, we'll simulate the command being run
      const result = await this.executeBotScript(volatility, duration);
      
      this.addMessage(
        `✅ Bot simulation ${result.success ? 'started successfully' : 'failed'}\n${result.message}`,
        'assistant'
      );
    } catch (error: any) {
      this.addMessage(`❌ Failed to start bot simulation: ${error.message}`, 'assistant');
    } finally {
      // Reset after duration, but only if not stopped
      if (this.botSimulationTimeout) {
        clearTimeout(this.botSimulationTimeout);
        this.botSimulationTimeout = null;
      }
      this.botSimulationTimeout = setTimeout(() => {
        if (this.botSimulationRunning) {
          this.botSimulationRunning = false;
          this.addMessage('🤖 Bot simulation completed', 'assistant');
        }
        this.botSimulationTimeout = null;
      }, duration * 1000);
    }
  }

  /**
   * Execute bot simulation directly in the browser
   */
  private async executeBotScript(volatility: 'normal' | 'high' | 'extreme', duration: number): Promise<{ success: boolean; message: string }> {
    if (!this.currentEnvironment || !this.currentStock) {
      return { success: false, message: 'Missing environment or stock context' };
    }

    try {
      // Start the bot simulation service
      const result = await this.botSimulationService.startSimulation(
        this.currentEnvironment.id,
        this.currentStock.id,
        volatility,
        duration,
        5 // 5 bots
      );

      return result;
    } catch (err: any) {
      console.error('Unexpected error:', err);
      return {
        success: false,
        message: `Unexpected error: ${err.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Quick action: Run normal volatility bot simulation
   */
  async quickActionNormalVolatility(): Promise<void> {
    await this.runBotSimulation('normal', 30);
  }

  /**
   * Quick action: Run high volatility bot simulation
   */
  async quickActionHighVolatility(): Promise<void> {
    await this.runBotSimulation('high', 30);
  }

  /**
   * Quick action: Run extreme volatility bot simulation
   */
  async quickActionExtremeVolatility(): Promise<void> {
    await this.runBotSimulation('extreme', 30);
  }

  /**
   * Stop the current bot simulation
   */
  stopSimulation(): void {
    this.botSimulationService.stopSimulation();
    this.botSimulationRunning = false;
    if (this.botSimulationTimeout) {
      clearTimeout(this.botSimulationTimeout);
      this.botSimulationTimeout = null;
    }
    this.addMessage('🛑 Bot simulation stopped', 'assistant');
  }

  /**
   * Validate that context is set
   */
  validateContext(): boolean {
    if (!this.currentEnvironment) {
      this.addMessage('⚠️ No environment context. Please navigate to the trading page or use "set environment [id]"', 'assistant');
      return false;
    }
    if (!this.currentParticipant) {
      this.addMessage('⚠️ No participant context. Please navigate to the trading page or use "set participant [id]"', 'assistant');
      return false;
    }
    if (!this.currentStock) {
      this.addMessage('⚠️ No stock selected. Please select a stock on the trading page or use "set stock [id]"', 'assistant');
      return false;
    }
    return true;
  }
}
