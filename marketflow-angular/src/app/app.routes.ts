import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { EnvironmentSetup } from './components/tutorial/tutorial';
import { Analysis } from './components/analysis/analysis';
import { BotManagement } from './components/bot-management/bot-management';
import { AnalysisDashboard } from './components/analysis-dashboard/analysis-dashboard';
import { Login } from './components/login/login';
import { Dashboard } from './components/dashboard/dashboard';
import { Trading } from './components/trading/trading';
import { AskVsBidComponent } from './components/tutorial/ask-vs-bid/ask-vs-bid.component';
import { SpreadComponent } from './components/tutorial/spread/spread.component';
import { OrderBookComponent } from './components/tutorial/order-book/order-book.component';
import { SpottingGoodTradesComponent } from './components/tutorial/spotting-good-trades/spotting-good-trades.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Home, canActivate: [authGuard] },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'trading', component: Trading, canActivate: [authGuard] },
  { path: 'tutorial', component: EnvironmentSetup, canActivate: [authGuard] },
  { path: 'tutorial/ask-vs-bid', component: AskVsBidComponent, canActivate: [authGuard] },
  { path: 'tutorial/spread', component: SpreadComponent, canActivate: [authGuard] },
  { path: 'tutorial/order-book', component: OrderBookComponent, canActivate: [authGuard] },
  { path: 'tutorial/spotting-good-trades', component: SpottingGoodTradesComponent, canActivate: [authGuard] },
  { path: 'analysis', component: Analysis, canActivate: [authGuard] },
  { path: 'analysis-dashboard', component: AnalysisDashboard, canActivate: [authGuard] },
  { path: 'bot-management', component: BotManagement, canActivate: [authGuard] },
  { path: '**', redirectTo: '/' }
];