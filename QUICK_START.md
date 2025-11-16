# Quick Start Guide - Sign-In API

## ✅ Files Already Created!

I've already set up your credential and endpoint files. Here's what was created:

### 1. Credential File (`~/.fm/credential`)
```
account=opulent-most
email=u1319222@utah.edu
password=!adhoc1
```

### 2. Endpoint File (`~/.fm/endpoint`)
```
endpoint=https://fm-data.herokuapp.com/api/marketplaces/640
```

**Note**: If your marketplace ID is different from 640, edit this file and change the number.

---

## 🚀 Test the Sign-In (Choose One Method)

### Method 1: Use the Test Script (Easiest!)
```bash
cd /Users/vivekanandh/Projects/fm-robots
./test-signin.sh
```

This will:
- Read your credentials from the files
- Make the sign-in API call
- Show you the response
- Save the token to `~/.fm/token.txt`

### Method 2: Use cURL Directly
```bash
curl -X POST https://fm-data.herokuapp.com/api/tokens \
  -H "Accept: application/json, application/hal+json" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "opulent-most|u1319222@utah.edu",
    "password": "!adhoc1"
  }'
```

### Method 3: Run a Java Application
The Java applications will automatically sign in when you run them:

```bash
# First, build the project (if not already built)
cd /Users/vivekanandh/Projects/fm-robots
mvn clean install -DskipTests

# Then run any application (it will auto sign-in)
java -jar applications/manager/target/fm-manager-0.6.0-SNAPSHOT.jar --help
```

---

## 📋 What to Expect

### Successful Response
You should see JSON like this:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "account": {
    "id": 123,
    "name": "opulent-most"
  },
  "person": {
    "id": 456,
    "email": "u1319222@utah.edu"
  }
}
```

### If You Get an Error

**401 Unauthorized:**
- Check that your credentials are correct
- Make sure the username format is `account|email` (with pipe `|`)

**404 Not Found:**
- Check that the endpoint URL is correct
- Verify the marketplace ID in the endpoint file

**Connection Error:**
- Check your internet connection
- Verify the server URL is accessible

---

## 🔑 Using the Token

Once you have the token, use it in API calls like this:

```bash
# Get the token
TOKEN=$(cat ~/.fm/token.txt)

# Use it in API calls
curl -X GET https://fm-data.herokuapp.com/api/marketplaces/640 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json"
```

---

## 📚 More Information

- **Complete Walkthrough**: See `COMPLETE_WALKTHROUGH.md` for detailed instructions
- **All API Calls**: See `API_CALLS.md` for a list of all available APIs
- **Sign-In Details**: See `SIGNIN_API_CALL.md` for API call specifics

---

## 🎯 Next Steps

1. **Test the sign-in** using one of the methods above
2. **Verify you get a token** in the response
3. **Try making other API calls** using the token
4. **Run a Java application** to see it work automatically

---

## 💡 Quick Tips

- The token expires after some time - you'll need to sign in again
- The Java applications handle sign-in automatically
- You can update the credential/endpoint files anytime
- The test script saves your token for easy reuse

