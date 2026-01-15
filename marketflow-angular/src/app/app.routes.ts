import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { EnvironmentSetup } from './components/environment-setup/environment-setup';
import { Analysis } from './components/analysis/analysis';
import { BotManagement } from './components/bot-management/bot-management';
import { AnalysisDashboard } from './components/analysis-dashboard/analysis-dashboard';
import { Login } from './components/login/login';
import { Dashboard } from './components/dashboard/dashboard';
import { Trading } from './components/trading/trading';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', component: Home, canActivate: [authGuard] },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'trading', component: Trading, canActivate: [authGuard] },
  { path: 'environment-setup', component: EnvironmentSetup, canActivate: [authGuard] },
  { path: 'analysis', component: Analysis, canActivate: [authGuard] },
  { path: 'analysis-dashboard', component: AnalysisDashboard, canActivate: [authGuard] },
  { path: 'bot-management', component: BotManagement, canActivate: [authGuard] },
  { path: '**', redirectTo: '/' }
];