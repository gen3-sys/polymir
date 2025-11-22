# POLYMIR BACKEND - INTERACTIVE TESTING GUIDE

**Complete guide to testing your backend with real interactions**

---

## 🚀 QUICK START (5 Minutes)

### Step 1: Setup Database
```bash
# Create databases (PostgreSQL must be running)
createdb polymir_central
createdb polymir_world

# Run migrations
cd backend
npm run migrate
```

### Step 2: Populate Test Data
```bash
# Run database test script (creates sample players & schematics)
node test/database-test.js
```

**Expected Output:**
```
✅ Initialized database connections
✅ Created player: alice (trust: 0.80)
✅ Created player: bob (trust: 0.70)
✅ Created schematic: Small House by alice
✅ Created schematic: Tower by bob
🎉 All automated tests completed successfully!
```

### Step 3: Start Backend Server
```bash
# Start server
npm start
```

**Expected Output:**
```
[Info] Server: Configuration validated successfully
[Info] Server: Database pools initialized
[Info] Server: HTTP server listening on port 3000
[Info] Server: WebSocket server listening on port 3001
```

### Step 4: Open Test Interface
```bash
# Open in browser
start test/server-test.html
```

---

## 🎮 INTERACTIVE TEST INTERFACE

### Features

**1. Authentication Panel**
- Register new players
- Login with test accounts
- View JWT tokens
- Test trust scores

**2. Server Configuration**
- Test API connectivity
- Connect WebSocket
- Monitor connection status
- View server health

**3. Schematic Upload**
- Upload custom schematics
- Generate random test schematics
- Add tags and metadata
- View upload results

**4. Schematic Library**
- Search by name or tags
- Browse all schematics
- View schematic details
- Filter by creator

**5. Validation Testing**
- Request validation
- View pending validations
- Test consensus algorithms
- Monitor validation results

**6. Real-time Updates**
- Send position updates
- Subscribe to megachunks
- Receive live notifications
- Monitor WebSocket messages

---

## 📋 TEST SCENARIOS

### Scenario 1: User Registration & Login

**Steps:**
1. Open test interface
2. Enter username: `testuser1`
3. Enter password: `testpass123`
4. Click "Register"
5. Click "Login"

**Expected:**
- ✅ Registration success message
- ✅ Login returns JWT token
- ✅ Player trust score displayed (0.5)
- ✅ Connection status shows "Connected"

**Verification:**
```bash
# Check database
psql polymir_central -c "SELECT username, trust_score FROM players WHERE username='testuser1';"
```

### Scenario 2: Upload Schematic

**Steps:**
1. Login as `alice` (password: `password123`)
2. Click "Generate Random"
3. Modify name if desired
4. Click "Upload Schematic"

**Expected:**
- ✅ Schematic created in database
- ✅ IPFS CID generated
- ✅ Tags properly stored
- ✅ Creator linked to player

**Verification:**
```bash
# Check database
psql polymir_central -c "SELECT name, tags, creator_id FROM schematics ORDER BY created_at DESC LIMIT 1;"
```

### Scenario 3: Search Schematics

**Steps:**
1. In search box, enter: `building`
2. Click "Search"
3. View results in grid

**Expected:**
- ✅ All schematics with "building" tag shown
- ✅ Creator names displayed
- ✅ Click card shows full details

**Verification:**
- Cards should be clickable
- Details shown in output panel

### Scenario 4: Request Validation

**Steps:**
1. Login as `charlie` (password: `password123`) - Low trust player
2. Select "schematic_placement"
3. Click "Request Validation"

**Expected:**
- ✅ Consensus request created
- ✅ 5 validators required (charlie has low trust)
- ✅ Validation ID returned
- ✅ Status: "pending"

**Verification:**
```bash
# Check consensus
psql polymir_central -c "SELECT consensus_id, submitter_id, required_validators, status FROM consensus_results ORDER BY submitted_at DESC LIMIT 1;"
```

### Scenario 5: WebSocket Real-time

**Steps:**
1. Login as any user
2. Click "Connect WebSocket"
3. Wait for connection
4. Enter position: X=100, Y=50, Z=100
5. Click "Send Position"
6. Click "Subscribe Megachunk (0,0,0)"

**Expected:**
- ✅ WebSocket status shows "Connected"
- ✅ Authentication message sent
- ✅ Position update sent
- ✅ Subscription confirmation received

**Verification:**
- Green indicator in status bar
- Messages appear in WebSocket output panel

### Scenario 6: Trust Score Verification

**Steps:**
1. Load all schematics
2. Note which players created them
3. Compare with database trust scores

**Expected:**
- ✅ alice has highest trust (0.80)
- ✅ bob has medium trust (0.70)
- ✅ charlie has lower trust (0.60)
- ✅ Trust affects validation requirements

**Verification:**
```bash
# View all players with trust
psql polymir_central -c "SELECT username, trust_score, validations_submitted, validations_correct FROM players ORDER BY trust_score DESC;"
```

---

## 🔧 MANUAL API TESTING

### Using curl

#### 1. Register Player
```bash
curl -X POST http://localhost:3000/players/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "manualtest",
    "password": "testpass123"
  }'
```

#### 2. Login
```bash
curl -X POST http://localhost:3000/players/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "manualtest",
    "password": "testpass123"
  }'

# Save the token from response
export TOKEN="your-jwt-token-here"
```

#### 3. Get Player Info
```bash
curl http://localhost:3000/players/me \
  -H "Authorization: Bearer $TOKEN"
```

#### 4. Search Schematics
```bash
curl "http://localhost:3000/schematics/search?searchTerm=building" \
  -H "Authorization: Bearer $TOKEN"
```

#### 5. Upload Schematic
```bash
curl -X POST http://localhost:3000/schematics/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Building",
    "tags": ["test", "api", "building"],
    "data": {
      "size": {"x": 10, "y": 10, "z": 10},
      "blocks": [
        {"x": 0, "y": 0, "z": 0, "type": "stone"},
        {"x": 1, "y": 0, "z": 0, "type": "stone"}
      ]
    }
  }'
```

#### 6. Request Validation
```bash
curl -X POST http://localhost:3000/validation/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "schematic_placement",
    "eventDataCid": "QmTest123456789"
  }'
```

#### 7. Get Leaderboard
```bash
curl "http://localhost:3000/players/leaderboard?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🧪 ADVANCED TESTING

### Load Testing with Apache Bench

```bash
# Test login endpoint (100 requests, 10 concurrent)
ab -n 100 -c 10 -T application/json -p login.json http://localhost:3000/players/login

# login.json:
# {"username":"alice","password":"password123"}
```

### WebSocket Testing with wscat

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c ws://localhost:3001

# Send authentication
{"type":"authenticate","playerId":"<player-id>"}

# Send position
{"type":"position_update","position":{"x":100,"y":50,"z":100}}

# Subscribe to megachunk
{"type":"subscribe_megachunk","megachunkId":"megachunk:0,0,0"}
```

### Database Performance Testing

```bash
# Run database test with timing
time node test/database-test.js

# Check connection pool stats
psql polymir_central -c "SELECT * FROM pg_stat_activity WHERE datname='polymir_central';"
```

---

## 📊 MONITORING & METRICS

### Health Check
```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "uptime": 123,
  "timestamp": "2025-11-20T...",
  "memory": {...},
  "connections": {...}
}
```

### Database Statistics
```bash
# Player count
psql polymir_central -c "SELECT COUNT(*) FROM players;"

# Schematic count
psql polymir_central -c "SELECT COUNT(*) FROM schematics;"

# Active validations
psql polymir_central -c "SELECT COUNT(*) FROM consensus_results WHERE status='pending';"

# Average trust score
psql polymir_central -c "SELECT AVG(trust_score) FROM players;"
```

### WebSocket Connections
- Check test interface status bar
- Should show green indicator when connected
- Message count should increase with activity

---

## 🐛 TROUBLESHOOTING

### Database Connection Failed
```bash
# Check PostgreSQL is running
pg_isready

# Check databases exist
psql -l | grep polymir

# Recreate if needed
dropdb polymir_central
dropdb polymir_world
createdb polymir_central
createdb polymir_world
npm run migrate
```

### Server Won't Start
```bash
# Check ports are free
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Kill processes if needed
taskkill /PID <pid> /F

# Check environment variables
cat .env

# Verify npm install
npm install
```

### WebSocket Won't Connect
- Check server is running (`npm start`)
- Verify WebSocket port (default: 3001)
- Check browser console for errors
- Try different browser
- Disable browser extensions

### Authentication Failing
- Verify player exists in database
- Check password is correct
- Ensure JWT_SECRET is set
- Check token is being sent in headers
- Try re-registering user

---

## ✅ TESTING CHECKLIST

### Basic Functionality
- [ ] Database connection successful
- [ ] Sample data created
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Test interface loads

### Authentication
- [ ] Register new player works
- [ ] Login returns JWT token
- [ ] Token persists across requests
- [ ] Logout clears session
- [ ] Invalid credentials rejected

### Schematics
- [ ] Upload schematic succeeds
- [ ] Search finds schematics
- [ ] Tags work correctly
- [ ] Creator attribution correct
- [ ] IPFS CID generated

### Validation
- [ ] Request validation creates consensus
- [ ] Trust score affects validator count
- [ ] Votes can be submitted
- [ ] Consensus calculated correctly
- [ ] Trust scores update

### Real-time
- [ ] WebSocket connects
- [ ] Position updates sent
- [ ] Megachunk subscription works
- [ ] Messages received
- [ ] Reconnection works

### Performance
- [ ] Multiple concurrent users
- [ ] Database queries fast (< 100ms)
- [ ] WebSocket latency low (< 50ms)
- [ ] No memory leaks
- [ ] Connection pool stable

---

## 📈 NEXT STEPS

### After Testing Locally
1. Deploy to staging environment
2. Run tests against staging
3. Load test with realistic data
4. Security audit
5. Performance profiling
6. Production deployment

### Creating Test Schematics
```javascript
// Example schematic generator
function generateTestSchematic(size = 10) {
    const blocks = [];

    // Create a hollow cube
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            for (let z = 0; z < size; z++) {
                // Only edges
                if (x === 0 || x === size-1 ||
                    y === 0 || y === size-1 ||
                    z === 0 || z === size-1) {
                    blocks.push({
                        x, y, z,
                        type: 'stone'
                    });
                }
            }
        }
    }

    return {
        size: { x: size, y: size, z: size },
        blocks
    };
}
```

---

## 🎯 SUCCESS CRITERIA

**All Tests Passing When:**
- ✅ All 5 test accounts working
- ✅ Schematics upload/download functional
- ✅ Search returns accurate results
- ✅ Validation flow complete
- ✅ WebSocket real-time working
- ✅ No errors in server logs
- ✅ Database queries optimized
- ✅ Performance acceptable
- ✅ Security checks pass

**Ready for Production When:**
- All success criteria met
- Load testing completed
- Security audit passed
- Documentation complete
- Monitoring configured
- Backup strategy implemented
- Deployment scripts tested
- Rollback plan ready

---

## 📞 SUPPORT

**Issues or Questions?**
1. Check server logs in console
2. Check database for errors
3. Review test interface activity log
4. Verify environment variables
5. Confirm migrations ran successfully

**Common Fixes:**
- Restart server: `Ctrl+C` then `npm start`
- Clear database: Drop and recreate databases
- Reset test data: Run `database-test.js` again
- Browser refresh: Hard refresh test interface (Ctrl+F5)

---

**Happy Testing! 🚀**

