import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HelpModeService {

  // Internal state holder
  private helpModeSubject = new BehaviorSubject<boolean>(false);

  // Public observable for components to subscribe to
  helpMode$ = this.helpModeSubject.asObservable();

  // Turn help mode on/off
  setHelpMode(enabled: boolean): void {
    this.helpModeSubject.next(enabled);
  }

  // Quick synchronous check (useful inside directives)
  get isHelpMode(): boolean {
    return this.helpModeSubject.value;
  }
}