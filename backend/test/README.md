# POLYMIR BACKEND TESTING

Complete testing suite for the Polymir backend server.

---

## 🎯 What's Included

### 1. **database-test.js** - Database Test Script
Automated script that:
- Connects to PostgreSQL databases
- Creates 5 sample players (alice, bob, charlie, david, eve)
- Creates 3 sample schematics
- Tests validation flow
- Tests world server operations
- Displays statistics

**Run it:**
```bash
node test/database-test.js
```

### 2. **server-test.html** - Interactive Web Interface
Beautiful web interface for testing:
- Authentication (register/login)
- Schematic upload and management
- Library search and browsing
- Validation testing
- Real-time WebSocket updates
- Activity logging

**Open it:**
```bash
# Just open in browser
start test/server-test.html
# OR
open test/server-test.html  # Mac
xdg-open test/server-test.html  # Linux
```

### 3. **INTERACTIVE_TESTING_GUIDE.md** - Complete Manual
Step-by-step guide covering:
- Quick start (5 minutes)
- Test scenarios
- Manual API testing with curl
- WebSocket testing
- Monitoring & metrics
- Troubleshooting
- Testing checklist

---

## ⚡ QUICK START

### Prerequisites
- PostgreSQL installed and running
- Node.js 18+ installed
- npm dependencies installed (`npm install`)

### 1. Create Databases
```bash
createdb polymir_central
createdb polymir_world
```

### 2. Run Migrations
```bash
cd backend
npm run migrate
```

### 3. Populate Test Data
```bash
node test/database-test.js
```

**You'll get:**
- 5 test players with different trust levels
- 3 sample schematics
- Validation examples
- World server data

### 4. Start Server
```bash
npm start
```

### 5. Open Test Interface
```bash
start test/server-test.html
```

**Test credentials:**
- alice / password123 (High trust: 0.80)
- bob / password123 (Medium trust: 0.70)
- charlie / password123 (Low trust: 0.60)

---

## 📋 TEST SCENARIOS

### Basic Flow
1. **Login** as alice
2. **Generate Random** schematic
3. **Upload** to server
4. **Search** for your schematic
5. **Request Validation** for it
6. **Connect WebSocket**
7. **Send Position** updates

### Expected Results
✅ All operations succeed
✅ Data appears in database
✅ WebSocket shows real-time updates
✅ No errors in console

---

## 🧪 UNIT TESTS

Run automated unit tests:

```bash
# All tests
npm test

# Specific test file
node --test test/unit/utils/trust.test.js

# With coverage
npm test -- --coverage
```

**Current Status:**
- ✅ Trust system: 7/7 passing
- ✅ Coordinates: Tests created
- ✅ Consensus: Tests created
- ✅ Physics: Tests created

---

## 🔧 MANUAL API TESTING

### Register
```bash
curl -X POST http://localhost:3000/players/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'
```

### Login
```bash
curl -X POST http://localhost:3000/players/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'
```

### Upload Schematic
```bash
curl -X POST http://localhost:3000/schematics/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Build",
    "tags": ["test"],
    "data": {"size":{"x":10,"y":10,"z":10},"blocks":[]}
  }'
```

**More examples in INTERACTIVE_TESTING_GUIDE.md**

---

## 🌐 WEB INTERFACE FEATURES

### Authentication Panel
- Register new users
- Login/logout
- View JWT tokens
- See trust scores

### Upload Panel
- Upload schematics
- Generate random test data
- Add tags and metadata
- View upload results

### Library Panel
- Search schematics
- Browse all schematics
- View details
- Filter by creator

### Validation Panel
- Request validation
- View pending validations
- Test consensus algorithms

### WebSocket Panel
- Connect to server
- Send position updates
- Subscribe to megachunks
- View real-time messages

---

## 📊 MONITORING

### Health Check
```bash
curl http://localhost:3000/health
```

### Database Stats
```bash
psql polymir_central -c "SELECT COUNT(*) FROM players;"
psql polymir_central -c "SELECT COUNT(*) FROM schematics;"
psql polymir_central -c "SELECT COUNT(*) FROM consensus_results WHERE status='pending';"
```

### Server Logs
Watch server console for:
- Connection events
- API requests
- WebSocket messages
- Errors and warnings

---

## 🐛 TROUBLESHOOTING

### "Connection refused"
- Check server is running: `npm start`
- Verify ports 3000 and 3001 are free
- Check firewall settings

### "Database connection failed"
- PostgreSQL running: `pg_isready`
- Databases exist: `psql -l | grep polymir`
- Migrations ran: `npm run migrate`

### "Authentication failed"
- Player exists in database
- Password is correct
- JWT_SECRET is set in .env
- Token in Authorization header

### WebSocket won't connect
- Server running
- Correct WebSocket URL (ws://localhost:3001)
- Browser allows WebSocket
- Check browser console

---

## ✅ TESTING CHECKLIST

Before considering backend "ready":

**Database**
- [ ] Migrations run successfully
- [ ] Test data populates
- [ ] Queries are fast (< 100ms)
- [ ] Connection pool stable

**API**
- [ ] All endpoints respond
- [ ] Authentication works
- [ ] Validation correct
- [ ] Error handling good

**WebSocket**
- [ ] Connects successfully
- [ ] Messages send/receive
- [ ] Reconnection works
- [ ] Low latency (< 50ms)

**Functionality**
- [ ] Register/login works
- [ ] Schematics upload
- [ ] Search works
- [ ] Validation flows
- [ ] Trust scores update

**Performance**
- [ ] Handles 10+ concurrent users
- [ ] No memory leaks
- [ ] Stable under load
- [ ] Fast response times

---

## 📁 FILE STRUCTURE

```
backend/test/
├── README.md                          # This file
├── INTERACTIVE_TESTING_GUIDE.md       # Complete manual
├── database-test.js                   # Automated DB test
├── server-test.html                   # Web interface
├── setup.js                           # Test utilities
├── unit/                              # Unit tests
│   ├── utils/
│   │   ├── trust.test.js
│   │   └── coordinates.test.js
│   ├── validation/
│   │   └── consensus.test.js
│   └── physics/
│       ├── megachunkTransfer.test.js
│       └── bodyPhysics.test.js
└── integration/                       # Integration tests
    └── api/
        └── players.test.js
```

---

## 🚀 NEXT STEPS

1. **Run database-test.js** - Populate test data
2. **Start server** - `npm start`
3. **Open server-test.html** - Interactive testing
4. **Try all features** - Register, upload, search, validate
5. **Check database** - Verify data was saved
6. **Test WebSocket** - Real-time updates
7. **Review logs** - No errors

---

## 💡 TIPS

### Creating Test Schematics
Use the "Generate Random" button in web interface to create test data quickly.

### Testing Different Trust Levels
- alice (0.80) - High trust, no validation needed
- charlie (0.60) - Medium trust, 3 validators
- eve (0.40) - Low trust, 5 validators

### Monitoring WebSocket
Open browser DevTools (F12) → Network → WS tab to see WebSocket frames.

### Database Inspection
```bash
# Interactive PostgreSQL shell
psql polymir_central

# Quick queries
\dt                          # List tables
SELECT * FROM players;       # View players
SELECT * FROM schematics;    # View schematics
\q                          # Quit
```

---

## 📖 DOCUMENTATION

- **INTERACTIVE_TESTING_GUIDE.md** - Detailed testing manual
- **TESTING.md** - Test infrastructure docs
- **STATUS.md** - Backend status report
- **PRODUCTION_READY.md** - Deployment guide

---

## 🎉 SUCCESS INDICATORS

You'll know testing is successful when:
- ✅ All test scenarios complete without errors
- ✅ Database has sample data
- ✅ WebSocket shows "Connected"
- ✅ Schematics appear in search results
- ✅ Validation requests create consensus
- ✅ Activity log shows green checkmarks
- ✅ No errors in server console

---

**Ready to test? Run `node test/database-test.js` to begin!**

