# Sign-In API Call Example

## Credentials
- **Email**: u1319222@utah.edu
- **Account**: opulent-most
- **Password**: !adhoc1

## API Call Details

### HTTP Method
```
POST
```

### Endpoint URL
The endpoint URL is constructed from the base server URL + `/tokens`.

**Example base URLs:**
- For adhocmarkets.com (v3.x): `https://fm-data.herokuapp.com/api`
- For flexemarkets.com (v2.x): `https://guarded-ridge-89710.herokuapp.com/api`

**Full endpoint:**
```
POST https://fm-data.herokuapp.com/api/tokens
```
*(Replace with your actual server base URL)*

### Request Headers
```
Accept: application/json, application/hal+json
Content-Type: application/json
```

### Request Body (JSON)
The username is formatted as `{account}|{email}`:

```json
{
  "username": "opulent-most|u1319222@utah.edu",
  "password": "!adhoc1"
}
```

### Complete cURL Example
```bash
curl -X POST https://fm-data.herokuapp.com/api/tokens \
  -H "Accept: application/json, application/hal+json" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "opulent-most|u1319222@utah.edu",
    "password": "!adhoc1"
  }'
```

### Response
On success, you'll receive a `Token` object containing:
- A JWT token string
- Account information
- Person/user information
- Other token metadata

The token can then be used in subsequent API calls as:
```
Authorization: Bearer {token}
```

### Notes
- The username format is: `{account}|{email}` (pipe-separated)
- The endpoint extracts the base server URL from the full endpoint configuration
- If you have a pre-existing token, you can pass it in the `Authorization` header instead of username/password
- After successful sign-in, the code automatically fetches the API endpoint resource to discover available links

