# Complete Step-by-Step Guide: Using the Sign-In API

This guide will walk you through making the sign-in API call using your credentials in multiple ways.

## Your Credentials
- **Email**: u1319222@utah.edu
- **Account**: opulent-most
- **Password**: !adhoc1

---

## Method 1: Using cURL (Command Line) - Easiest for Testing

### Step 1: Open Terminal/Command Prompt
- **Mac/Linux**: Open Terminal
- **Windows**: Open Command Prompt or PowerShell

### Step 2: Find Your Endpoint URL
You need to know which server you're connecting to. Common options:

**For adhocmarkets.com (version 3.x):**
```
https://fm-data.herokuapp.com/api/tokens
```

**For flexemarkets.com (version 2.x):**
```
https://guarded-ridge-89710.herokuapp.com/api/tokens
```

**If you're not sure:**
- Check your endpoint file at `~/.fm/endpoint` (see Method 4 below)
- Or ask your instructor/administrator which server you should use

### Step 3: Run the cURL Command
Copy and paste this command (replace the URL if needed):

```bash
curl -X POST https://fm-data.herokuapp.com/api/tokens \
  -H "Accept: application/json, application/hal+json" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "opulent-most|u1319222@utah.edu",
    "password": "!adhoc1"
  }'
```

**For Windows Command Prompt** (use this version instead):
```cmd
curl -X POST https://fm-data.herokuapp.com/api/tokens -H "Accept: application/json, application/hal+json" -H "Content-Type: application/json" -d "{\"username\": \"opulent-most|u1319222@utah.edu\", \"password\": \"!adhoc1\"}"
```

### Step 4: Understand the Response
If successful, you'll see JSON output like:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "account": {
    "id": 123,
    "name": "opulent-most",
    ...
  },
  "person": {
    "id": 456,
    "email": "u1319222@utah.edu",
    ...
  }
}
```

**Save the token value!** You'll need it for future API calls.

### Step 5: Use the Token
For subsequent API calls, include the token in the Authorization header:
```bash
curl -X GET https://fm-data.herokuapp.com/api/marketplaces/640 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Method 2: Using Postman (GUI Tool) - Best for Learning

### Step 1: Download and Install Postman
1. Go to https://www.postman.com/downloads/
2. Download and install Postman for your operating system
3. Open Postman

### Step 2: Create a New Request
1. Click "New" button (top left)
2. Select "HTTP Request"
3. Name it "Flexemarkets Sign-In"

### Step 3: Configure the Request
1. **Method**: Select "POST" from the dropdown (default is GET)
2. **URL**: Enter `https://fm-data.herokuapp.com/api/tokens`
   - (Replace with your server URL if different)

### Step 4: Set Headers
1. Click the "Headers" tab
2. Add these headers (click "Add Header" for each):
   - **Key**: `Accept`, **Value**: `application/json, application/hal+json`
   - **Key**: `Content-Type`, **Value**: `application/json`

### Step 5: Set Request Body
1. Click the "Body" tab
2. Select "raw" radio button
3. Select "JSON" from the dropdown (on the right)
4. Paste this JSON:
```json
{
  "username": "opulent-most|u1319222@utah.edu",
  "password": "!adhoc1"
}
```

### Step 6: Send the Request
1. Click the blue "Send" button
2. You'll see the response in the bottom panel

### Step 7: Save the Token
1. In the response, find the `token` field
2. Copy the entire token value
3. You can save it in Postman's environment variables for future use

---

## Method 3: Using a Browser Extension (REST Client)

### Option A: REST Client Extension (Chrome/Edge)
1. Install "REST Client" extension from Chrome Web Store
2. Create a new request file (`.http` or `.rest` file)
3. Add this content:
```
POST https://fm-data.herokuapp.com/api/tokens
Accept: application/json, application/hal+json
Content-Type: application/json

{
  "username": "opulent-most|u1319222@utah.edu",
  "password": "!adhoc1"
}
```
4. Click "Send Request" button

### Option B: Thunder Client (VS Code)
1. Install "Thunder Client" extension in VS Code
2. Click Thunder Client icon in sidebar
3. Click "New Request"
4. Configure:
   - Method: POST
   - URL: `https://fm-data.herokuapp.com/api/tokens`
   - Headers: Add Accept and Content-Type headers
   - Body: Select "JSON" and paste the JSON body
5. Click "Send"

---

## Method 4: Using the Java Application (Recommended for This Project)

This is the easiest way if you're working with this codebase!

### Step 1: Create the Credential File
1. Open Terminal/Command Prompt
2. Navigate to your home directory:
   ```bash
   cd ~
   ```
3. Create the `.fm` directory (if it doesn't exist):
   ```bash
   mkdir -p .fm
   ```
   (On Windows: `mkdir .fm`)
4. Create the credential file:
   ```bash
   nano ~/.fm/credential
   ```
   (On Windows: `notepad %USERPROFILE%\.fm\credential`)
   (On Mac: You can also use `open -a TextEdit ~/.fm/credential`)

5. Add these lines to the file:
   ```
   account=opulent-most
   email=u1319222@utah.edu
   password=!adhoc1
   ```

6. Save and close the file

### Step 2: Create the Endpoint File
1. Create the endpoint file:
   ```bash
   nano ~/.fm/endpoint
   ```
   (On Windows: `notepad %USERPROFILE%\.fm\endpoint`)

2. Add this line (replace with your actual marketplace ID):
   ```
   endpoint=https://fm-data.herokuapp.com/api/marketplaces/640
   ```
   **Note**: Replace `640` with your actual marketplace ID if different

3. Save and close the file

### Step 3: Build the Project (if not already built)
1. Navigate to the project root:
   ```bash
   cd /Users/vivekanandh/Projects/fm-robots
   ```
2. Build the project:
   ```bash
   mvn clean install -DskipTests
   ```

### Step 4: Run an Application
The sign-in happens automatically when you run any application. For example:

```bash
# Run the manager application
java -jar applications/manager/target/fm-manager-0.6.0-SNAPSHOT.jar

# Or run a robot
java -jar applications/robots/taker/target/fm-taker-0.6.0-SNAPSHOT.jar
```

The application will:
1. Read your credential file
2. Automatically call the sign-in API
3. Store the token
4. Use it for all subsequent API calls

---

## Method 5: Using Python (for Scripting)

### Step 1: Create a Python Script
Create a file called `signin.py`:

```python
import requests
import json

# Your credentials
username = "opulent-most|u1319222@utah.edu"
password = "!adhoc1"

# API endpoint
url = "https://fm-data.herokuapp.com/api/tokens"

# Headers
headers = {
    "Accept": "application/json, application/hal+json",
    "Content-Type": "application/json"
}

# Request body
data = {
    "username": username,
    "password": password
}

# Make the request
response = requests.post(url, headers=headers, json=data)

# Check if successful
if response.status_code == 200:
    token_data = response.json()
    print("Success! Token received:")
    print(f"Token: {token_data.get('token', 'N/A')}")
    
    # Save token to a file for later use
    with open('token.txt', 'w') as f:
        f.write(token_data.get('token', ''))
    print("\nToken saved to token.txt")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
```

### Step 2: Run the Script
```bash
python signin.py
```

### Step 3: Use the Token
```python
import requests

# Read token from file
with open('token.txt', 'r') as f:
    token = f.read().strip()

# Use token in API calls
headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json"
}

response = requests.get(
    "https://fm-data.herokuapp.com/api/marketplaces/640",
    headers=headers
)

print(response.json())
```

---

## Troubleshooting

### Error: "401 Unauthorized"
- **Cause**: Wrong credentials or username format
- **Fix**: 
  - Double-check your username format: `account|email` (with pipe `|`)
  - Verify your password is correct
  - Make sure there are no extra spaces

### Error: "404 Not Found"
- **Cause**: Wrong endpoint URL
- **Fix**: Verify the server URL is correct

### Error: "Connection refused" or "Could not resolve host"
- **Cause**: Network issue or wrong server URL
- **Fix**: 
  - Check your internet connection
  - Verify the server URL is correct
  - Try pinging the server: `ping fm-data.herokuapp.com`

### Error: "curl: command not found"
- **Cause**: cURL not installed
- **Fix**: 
  - **Mac**: Usually pre-installed, try updating
  - **Windows**: Download from https://curl.se/windows/
  - **Linux**: `sudo apt-get install curl` (Ubuntu/Debian)

### Error: "Invalid JSON" or "Malformed request"
- **Cause**: JSON formatting issue
- **Fix**: 
  - Make sure you're using double quotes `"` not single quotes `'`
  - Check for trailing commas
  - Validate JSON at https://jsonlint.com/

---

## Understanding the Response

A successful sign-in response typically contains:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "account": {
    "id": 123,
    "name": "opulent-most",
    "description": "...",
    "ownerId": 456
  },
  "person": {
    "id": 456,
    "email": "u1319222@utah.edu",
    "name": "..."
  },
  "expiresAt": "2024-01-01T12:00:00Z"
}
```

**Important fields:**
- `token`: The JWT token you'll use for authentication
- `account`: Your account information
- `person`: Your user/person information
- `expiresAt`: When the token expires (you'll need to sign in again after this)

---

## Next Steps

After successful sign-in:

1. **Save the token** for future API calls
2. **Use the token** in the `Authorization: Bearer {token}` header
3. **Explore the API** using the endpoint resource links
4. **Set up credential files** if using the Java applications

---

## Quick Reference

**Sign-In Endpoint:**
```
POST {baseUrl}/tokens
```

**Request Body:**
```json
{
  "username": "account|email",
  "password": "your-password"
}
```

**Using Token:**
```
Authorization: Bearer {token}
```

**Your Specific Credentials:**
- Username: `opulent-most|u1319222@utah.edu`
- Password: `!adhoc1`

