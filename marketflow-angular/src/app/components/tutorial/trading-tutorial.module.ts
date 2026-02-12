import { NgModule } from '@angular/core';
import { AskVsBidComponent } from './ask-vs-bid/ask-vs-bid.component';
import { SpreadComponent } from './spread/spread.component';
import { OrderBookComponent } from './order-book/order-book.component';
import { TradeHistoryComponent } from './trade-history/trade-history.component';
import { SpottingGoodTradesComponent } from './spotting-good-trades/spotting-good-trades.component';

@NgModule({
  imports: [
    AskVsBidComponent,
    SpreadComponent,
    OrderBookComponent,
    TradeHistoryComponent,
    SpottingGoodTradesComponent
  ],
  exports: [
    AskVsBidComponent,
    SpreadComponent,
    OrderBookComponent,
    TradeHistoryComponent,
    SpottingGoodTradesComponent
  ]
})
export class TradingTutorialModule {}
