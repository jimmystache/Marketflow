# API Calls in fm-robots

This document lists all HTTP API calls made in the codebase.

## Authentication & Initialization

### Sign In (POST)
- **Location**: `Utilities._signInToken()`
- **Method**: POST
- **Endpoint**: `/tokens`
- **Purpose**: Authenticate and obtain a bearer token
- **Request Body**: `SignIn` object (username, password)
- **Response**: `Token` object

### Get API Endpoint Resource (GET)
- **Location**: `Utilities._endpoint()`
- **Method**: GET
- **Endpoint**: Base API endpoint (e.g., `/api`)
- **Purpose**: Retrieve the HAL-formatted API endpoint resource with all available links
- **Response**: `EntityModel<Object>` (HAL resource)

## Accounts

### List Accounts (GET)
- **Location**: `Flexemarkets.accounts()`
- **Method**: GET
- **Endpoint**: `/accounts?format=application/json`
- **Response**: `List<Account>`

### Get Account (GET)
- **Location**: `Flexemarkets.account()`
- **Method**: GET
- **Endpoint**: `/accounts/{accountId}`
- **Response**: `Account`

## Marketplaces

### List Marketplaces (GET)
- **Location**: `Flexemarkets.marketplaces()`
- **Method**: GET
- **Endpoint**: `/marketplaces?format=application/json`
- **Response**: `List<Marketplace>`

### Get Marketplace (GET)
- **Location**: `Flexemarkets.marketplace()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}`
- **Response**: `Marketplace`

## Markets

### List Markets (GET)
- **Location**: `Flexemarkets.markets()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/markets?format=application/json`
- **Response**: `List<Market>`

### List Symbols (GET)
- **Location**: `Flexemarkets.symbols()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/symbols`
- **Response**: `List<String>`

## Sessions

### List Sessions (GET)
- **Location**: `Flexemarkets.sessions()` (overloaded)
- **Method**: GET
- **Endpoint**: 
  - `/marketplaces/{marketplaceId}/sessions?format=application/json` (all sessions)
  - `/marketplaces/{marketplaceId}/sessions?sessionIds={ids}&format=application/json` (filtered by session IDs)
- **Response**: `List<Session>`

### Get Current Session (GET)
- **Location**: `Flexemarkets.session()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/currentSession`
- **Response**: `Session`

### Open Session (PATCH)
- **Location**: `Flexemarkets.openSession()`
- **Method**: PATCH
- **Endpoint**: `/marketplaces/{marketplaceId}/open`
- **Response**: `Session`

### Pause Session (PATCH)
- **Location**: `Flexemarkets.pauseSession()`
- **Method**: PATCH
- **Endpoint**: `/marketplaces/{marketplaceId}/pause`
- **Response**: `Session`

### Close Session (PATCH)
- **Location**: `Flexemarkets.closeSession()`
- **Method**: PATCH
- **Endpoint**: `/marketplaces/{marketplaceId}/close`
- **Response**: `Session`

## Connections

### List Connections (GET)
- **Location**: `Flexemarkets.connections()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/connections?sessionIds={ids}`
- **Response**: `List<ClientConnection>`

## Orders

### Submit Limit Order (POST)
- **Location**: `Flexemarkets.submitLimit()`
- **Method**: POST
- **Endpoint**: `/orders`
- **Request Body**: `Order` object (limit order)
- **Response**: `Order`

### Submit Private Limit Order (POST)
- **Location**: `Flexemarkets.submitPrivateLimit()`
- **Method**: POST
- **Endpoint**: `/orders`
- **Request Body**: `Order` object (private limit order)
- **Response**: `Order`

### Submit Cancel Order (POST)
- **Location**: `Flexemarkets.submitCancel()`
- **Method**: POST
- **Endpoint**: `/orders`
- **Request Body**: `Order` object (cancel order)
- **Response**: `Order`

### Get Orders by Symbol (GET)
- **Location**: `Flexemarkets.orders()` (symbol variant)
- **Method**: GET
- **Endpoint**: `/symbolOrdersJson?marketplaceId={marketplaceId}&symbol={symbol}`
- **Response**: `List<Order>`

### Get Trades by Symbol (GET)
- **Location**: `Flexemarkets.trades()`
- **Method**: GET
- **Endpoint**: `/symbolTradesJson?marketplaceId={marketplaceId}&symbol={symbol}`
- **Response**: `List<Order>`

### Get Orders by Session (GET)
- **Location**: `Flexemarkets.orders()` (session variant)
- **Method**: GET
- **Endpoint**: `/sessionOrdersJson?marketplaceId={marketplaceId}&sessionIds={ids}`
- **Response**: `List<Order>`

### Get All Orders (GET)
- **Location**: `Flexemarkets.orders()` (no parameters)
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/orders`
- **Response**: `List<Order>`

## Holdings

### List Holdings (GET)
- **Location**: `Flexemarkets.holdings()` (overloaded)
- **Method**: GET
- **Endpoint**: 
  - `/marketplaces/{marketplaceId}/holdings` (all holdings)
  - `/marketplaces/{marketplaceId}/holdings?sessions={ids}` (filtered by session IDs)
- **Response**: `List<Holding>`

### Get Current Holding (GET)
- **Location**: `Flexemarkets.holding()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/currentHolding`
- **Response**: `Holding`

### Download Holdings (GET)
- **Location**: `Flexemarkets.downloadHoldings()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/holdings/downloads`
- **Response**: `String` (CSV content)

### Upload Holdings (POST - Multipart)
- **Location**: `Flexemarkets.uploadHoldings()` (overloaded)
- **Method**: POST
- **Endpoint**: `/marketplaces/{marketplaceId}/holdings/uploads`
- **Content-Type**: `multipart/form-data`
- **Request Body**: Multipart file upload with field name "file"
- **Response**: `List<Allotment>` (converted to `List<Holding>`)

## Users

### List Users (GET)
- **Location**: `Flexemarkets.users()`
- **Method**: GET
- **Endpoint**: `/usersJson`
- **Response**: `List<Person>`

### Get User (GET)
- **Location**: `Flexemarkets.user()`
- **Method**: GET
- **Endpoint**: `/users/{id}`
- **Response**: `Person`

## Identifiers

### Get Private Traders (GET)
- **Location**: `Flexemarkets.identifiers()`
- **Method**: GET
- **Endpoint**: `/marketplaces/{marketplaceId}/privateTraders`
- **Response**: `String[]`

## WebSocket Connections

### WebSocket STOMP Connection
- **Location**: `Utilities.stompSession()`
- **Protocol**: WebSocket (STOMP over WebSocket)
- **Endpoint**: `ws://{server}/events` (converted from HTTP endpoint)
- **Purpose**: Real-time event streaming for market data, order updates, etc.
- **Headers**: 
  - Authorization: Bearer token
  - Sec-WebSocket-Protocol: v12.stomp, v11.stomp, v10.stomp
  - agent-description: Client description
  - marketplace-id: Marketplace ID

## Implementation Details

### HTTP Client
- **Primary Client**: Spring WebClient (reactive, non-blocking)
- **Secondary Client**: Spring RestTemplate (synchronous, used for sign-in)
- **Base URL**: Extracted from endpoint configuration (e.g., `https://fm-data.herokuapp.com/api`)

### Authentication
- **Initial**: Basic Auth (account|email + password) or Bearer token
- **After Sign-In**: Bearer token (JWT) for all subsequent requests
- **Header**: `Authorization: Bearer {token}`

### Request Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `User-Agent: fm-lib-net/0.6.0`
- `Client-Timing: rt={nanoTime}` (for performance tracking)
- `Authorization: Bearer {token}`

### Response Handling
- 2xx: Success, deserialize response body
- 4xx: Client error, deserialize as `ApiFailure` and throw exception
- 5xx: Server error, throw exception

### Performance Tracking
- All API calls are tracked with histograms
- Key format: `{METHOD} {uri}` (with resource IDs replaced by `{n}`)
- Round-trip timing captured via `Client-Timing` header

### Packet Capture
- Optional request/response capture when `capturePackets()` is enabled
- Prints HTTP method, URL, headers, and status code to stdout

