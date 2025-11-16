# FIGMA Design Reference Documentation

This document contains design patterns, component structures, and implementation details extracted from the FIGMA folder for reference when implementing Angular components.

## Color Palette

```css
--green-50: #f0fdf4 (oklch(.982 .018 155.826))
--green-100: #dcfce7 (oklch(.962 .044 156.743))
--green-200: #bbf7d0 (oklch(.925 .084 155.995))
--green-600: #16a34a (oklch(.627 .194 149.214))
--green-700: #15803d (oklch(.527 .154 150.069))
--green-800: #166534 (oklch(.448 .119 151.328))
--gray-100: #f3f4f6 (oklch(.967 .003 264.542))
--gray-600: #4b5563 (oklch(.446 .03 256.802))
--white: #ffffff
```

## Typography

- Base font size: 16px
- H1: 6rem, font-weight 500, line-height 1.5
- H2: 1.5rem (text-2xl), font-weight 500, line-height 1.5
- H3: 1.25rem (text-xl), font-weight 500, line-height 1.5
- Body: 1rem, font-weight 400, line-height 1.5
- Small text: 0.875rem (text-sm)
- Buttons/Labels: font-weight 500

## Border Radius

- Default radius: 0.625rem (--radius)
- rounded-sm: calc(var(--radius) - 4px)
- rounded-md: calc(var(--radius) - 2px) = 0.375rem
- rounded-lg: var(--radius) = 0.625rem
- rounded-xl: calc(var(--radius) + 4px) = 0.875rem
- rounded-2xl: 1rem (--radius-2xl)
- rounded-full: 9999px

## Component Patterns

### Card Component
- Background: white
- Border: 2px solid gray-100
- Border-radius: rounded-xl (0.875rem)
- Hover: border-green-200, shadow-xl
- Decorative circle: top-0 right-0, w-32 h-32, bg-green-50, rounded-full, -mr-16 -mt-16
- Decorative circle hover: scale-150

### Button Component
- Default: h-9, px-4, py-2, rounded-md
- Green primary: bg-green-600, hover:bg-green-700, text-white
- Ghost variant: hover:bg-accent, hover:text-accent-foreground
- Group hover scale: scale-105

### Input Component
- Height: h-9
- Padding: px-3, py-1
- Border-radius: rounded-md (0.375rem)
- Background: bg-input-background (#f3f3f5)
- Focus: border-ring, ring-ring/50, ring-[3px]

### Icon Containers
- Padding: p-4 (1rem)
- Background: bg-green-100
- Border-radius: rounded-2xl (1rem)
- Hover: bg-green-200
- Icon size: h-10 w-10 (2.5rem) for cards, h-12 w-12 (3rem) for header

## Page Layouts

### Home Page
- Background: bg-green-50
- Container: max-w-7xl, centered
- Header: centered, mb-12
- Feature cards: grid grid-cols-1 md:grid-cols-3, gap-8, mb-12
- Stats cards: grid grid-cols-1 md:grid-cols-3, gap-6

### Environment Setup Page
- Background: bg-green-50
- Container: max-w-2xl, mx-auto
- Card: p-8, bg-white
- Form fields: space-y-6
- Field groups: space-y-2

### Analysis Page
- Background: bg-green-50
- Container: max-w-2xl, mx-auto
- Tabs: grid w-full grid-cols-2
- Upload area: border-2 border-dashed border-gray-300, rounded-lg, p-8
- Upload area hover: border-gray-400

### Bot Management Page
- Background: bg-green-50
- Container: max-w-6xl, mx-auto
- Grid: grid-cols-1 lg:grid-cols-2, gap-6
- Two cards side by side: Edit Bot and Create Bot

### Dashboard Page
- Background: bg-green-50
- Container: max-w-7xl, mx-auto
- Grid: grid-cols-1 lg:grid-cols-4, gap-6
- Main content: lg:col-span-3
- Side panel: lg:col-span-1
- Filter bar: p-4, bg-white
- Chart card: p-6, bg-white
- Table card: p-6, bg-white
- Stats card: p-6, bg-white

## Icons (Lucide React)

### Main Icons
- Settings: Environment Setup
- BarChart3: Market Analysis
- Bot: Bot Management
- TrendingUp: Header icon, Total Volume stat
- Users: Active Users stat
- Activity: Trading Sessions stat
- ArrowLeft: Back button
- Upload: File upload
- Server: Server sessions
- Download: Export report
- Camera: Screenshot

## Transitions

- Default duration: 300ms (duration-300)
- Timing function: ease
- Properties: all, transform, colors, box-shadow

## Spacing

- p-3: 0.75rem
- p-4: 1rem
- p-6: 1.5rem
- p-8: 2rem
- gap-4: 1rem
- gap-6: 1.5rem
- gap-8: 2rem
- space-y-2: 0.5rem vertical gap
- space-y-6: 1.5rem vertical gap

## Component Implementations

### Environment Setup
- Form fields: Environment Name, Description, API Key, Endpoint URL
- Submit button: "Create Environment"
- Back button with ArrowLeft icon

### Analysis
- Tabs: Upload CSV and Server Sessions
- Upload: File input with drag-and-drop area
- Server Sessions: Select dropdown with session list
- Start Analysis button (disabled until file/session selected)

### Bot Management
- Two-column layout: Edit Bot and Create Bot
- Edit Bot: File upload, Bot Name, Description, Settings
- Create Bot: Bot Name, Bot Type, Description, Configuration
- File upload areas with dashed borders

### Dashboard
- Filter bar: Market Session, Time Range, Stock Symbol (Select dropdowns)
- Price chart: LineChart with green-600 stroke
- Leaderboard table: Rank, Name/Team, Total Trades, Profit/Loss, ROI %
- Quick Stats sidebar: Total Trades, Total Volume, Current Price, Active Traders
- Recent Activity feed: List of trading activities with timestamps
- Export buttons: Export Report, Take Screenshot

## Mock Data Patterns

### Trading Sessions
```typescript
{
  id: string;
  name: string;
  date: string;
  traders: number;
}
```

### Leaderboard Entry
```typescript
{
  rank: number;
  name: string;
  totalTrades: number;
  profitLoss: number;
  roi: number;
}
```

### Recent Activity
```typescript
{
  id: number;
  text: string;
  time: string;
}
```

## Key Design Principles

1. **Consistent Spacing**: Use Tailwind spacing scale (p-4, p-6, p-8, gap-6, gap-8)
2. **Green Theme**: All primary actions use green-600/green-700
3. **White Cards**: All content areas use white cards on green-50 background
4. **Hover Effects**: Scale transforms (1.05), border color changes, shadow elevation
5. **Smooth Transitions**: 300ms ease for all interactive elements
6. **Rounded Corners**: 0.625rem default, 0.875rem for cards, 1rem for icon containers
7. **Typography**: Medium weight (500) for headings and buttons, normal (400) for body

