# Copilot Instructions for MarketFlow

## Project Overview
- **MarketFlow** is a multi-part application for market simulation and analysis, consisting of an Angular frontend (`marketflow-angular`) and backend integrations (Supabase, custom APIs).
- The Angular app is organized by feature, with each major function (trading, analysis, dashboard, bot management, etc.) in its own directory under `src/app/components/`.
- Data and real-time updates are managed via `SupabaseService` (`src/app/services/supabase.service.ts`), which defines all DB types and handles live channels.
- Authentication is handled by `AuthService` (`src/app/services/auth.service.ts`) and enforced in routes via `authGuard` (`src/app/guards/auth.guard.ts`).

## Key Workflows
- **Development:**
  - Start the Angular dev server: `ng serve` (from `marketflow-angular` directory).
  - Build: `ng build`
  - Unit tests: `ng test` (Karma)
  - E2E tests: `ng e2e` (user must configure framework)
- **API Integration:**
  - Use `SupabaseService` for all DB and real-time operations. Do not access Supabase directly elsewhere.
  - Use `AuthService` for login/session management. Store tokens in localStorage under `marketflow_session_token`.
- **Routing:**
  - All routes (except `/login`) are protected by `authGuard`.
  - Route definitions: `src/app/app.routes.ts`

## Project-Specific Patterns
- **Component Structure:**
  - Components are standalone (Angular v17+), using `standalone: true` and explicit `imports`.
  - Shared UI elements (e.g., `Card`, `Button`) are in their own folders under `components/`.
- **State Management:**
  - Use RxJS `BehaviorSubject` in services for state and real-time updates.
  - Do not use global state libraries (e.g., NgRx) unless already present.
- **API Models:**
  - All DB and API types are defined in `supabase.service.ts` and reused across components.
- **Styling:**
  - CSS files are colocated with components. Use component-level styles, not global.

## Integration Points
- **Supabase:**
  - All DB, real-time, and authentication logic flows through `SupabaseService`.
- **External APIs:**
  - Analysis and marketplace data may be fetched from external endpoints (see `analysis.ts`).

## Examples
- To add a new protected page:
  1. Create a standalone component in `components/`.
  2. Add route in `app.routes.ts` with `canActivate: [authGuard]`.
  3. Use `AuthService` for any user/session logic.
- To add a new DB type or operation:
  1. Define the type and method in `supabase.service.ts`.
  2. Use the service in your component via dependency injection.

## References
- Main Angular app: `marketflow-angular/`
- Routing: `src/app/app.routes.ts`
- Auth: `src/app/services/auth.service.ts`, `src/app/guards/auth.guard.ts`
- DB/Realtime: `src/app/services/supabase.service.ts`
- Example components: `src/app/components/`

---
For more, see `marketflow-angular/README.md` and inline comments in services/components.
