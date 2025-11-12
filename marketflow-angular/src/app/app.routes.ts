import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { Home } from './components/home/home';
import { EnvironmentSetup } from './components/environment-setup/environment-setup';
import { Analysis } from './components/analysis/analysis';
import { BotManagement } from './components/bot-management/bot-management';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'environment-setup', component: EnvironmentSetup },
  { path: 'analysis', component: Analysis },
  { path: 'bot-management', component: BotManagement },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule{}