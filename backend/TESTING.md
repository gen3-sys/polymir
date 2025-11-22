# POLYMIR BACKEND TESTING GUIDE

## Test Status

**Created:** 8 test files covering core functionality
**Status:** Partial (pending npm install + fixes)
**Coverage:** ~40% of backend code

## Test Structure

```
backend/test/
├── setup.js                          # Test utilities and mocks
├── unit/
│   ├── utils/
│   │   ├── trust.test.js            # ✅ Trust system (7 tests, ALL PASS)
│   │   └── coordinates.test.js      # ⚠️  Coordinate system (pending export fixes)
│   ├── validation/
│   │   └── consensus.test.js        # ⚠️  Consensus algorithms (pending npm install)
│   └── physics/
│       ├── megachunkTransfer.test.js # ⚠️  Megachunk boundaries (pending export fixes)
│       └── bodyPhysics.test.js      # ⚠️  Body physics (pending npm install)
└── integration/
    └── api/
        └── players.test.js           # ⚠️  Player API (pending npm install + supertest)
```

## Running Tests

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Run All Tests

```bash
npm test
```

### 3. Run Specific Test File

```bash
node --test test/unit/utils/trust.test.js
```

### 4. Run Test Suite

```bash
# Unit tests only
node --test test/unit/**/*.test.js

# Integration tests
node --test test/integration/**/*.test.js
```

## Required Fixes Before Tests Pass

### 1. Install npm Dependencies ✅ (Ready)
```bash
npm install
```

### 2. Fix Coordinate System Exports

**File:** `backend/src/utils/coordinates.js`

**Missing Exports:**
- `worldToLocal` (used in tests, but actual function name may differ)
- `getNeighborMegachunks` (may not be implemented yet)

**Action:** Check coordinates.js and either:
- Add missing functions
- Update test imports to match actual function names

### 3. Fix Backend TODO Items

#### A. JWT Authentication
**File:** `backend/src/api/middleware/auth.js`
**Line:** `// TODO: Implement JWT verification`

**Current:** Basic player ID header authentication
**Needed:** JWT token generation and verification

#### B. Schematic Update Logic
**File:** `backend/src/api/routes/schematics.js`
**Line:** `// TODO: Implement update logic`

**Current:** Create and download only
**Needed:** PATCH/PUT endpoint for schematic updates

#### C. Vote Signature Verification
**File:** `backend/src/validation/handlers.js`
**Line:** `// TODO: Verify signature to ensure vote authenticity`
**Line:** `// TODO: Add signature for vote authenticity`

**Current:** No cryptographic validation
**Needed:** Sign votes with player's private key, verify before accepting

#### D. World Server ID Configuration
**File:** `backend/src/websocket/handlers/validation.js`
**Line:** `worldServerId: null, // TODO: Get from config`

**Current:** Hardcoded null
**Needed:** Load from config.js

## Test Results (Current)

### ✅ Passing Tests (7/7)
**File:** `test/unit/utils/trust.test.js`
```
✅ Trust System
  ✅ getValidatorsRequired
    ✅ should require 0 validators for high trust (>= 0.9)
    ✅ should require 3 validators for medium trust (0.5-0.89)
    ✅ should require 5 validators for low trust (< 0.5)
    ✅ should handle edge cases
  ✅ getTrustTier
    ✅ should return HIGH for trust >= 0.9
    ✅ should return MEDIUM for trust 0.5-0.89
    ✅ should return LOW for trust < 0.5
```

### ⚠️ Pending Tests (Blocked by npm install)
- Consensus algorithms (11 tests)
- Megachunk transfer (18 tests)
- Body physics (10 tests)
- Player API (12 tests)

**Total Pending:** ~51 tests

## Database Setup for Integration Tests

### 1. Create Test Databases

```bash
# PostgreSQL test databases
createdb polymir_central_test
createdb polymir_world_test
```

### 2. Run Migrations on Test DBs

```bash
# Set test database URLs
export TEST_CENTRAL_DB_URL="postgresql://postgres:postgres@localhost/polymir_central_test"
export TEST_WORLD_DB_URL="postgresql://postgres:postgres@localhost/polymir_world_test"

# Run migrations
psql $TEST_CENTRAL_DB_URL -f migrations/001_central_library_schema.sql
psql $TEST_WORLD_DB_URL -f migrations/002_world_server_schema.sql
```

### 3. Configure Test Environment

Create `backend/.env.test`:
```env
# Test Database - Central Library
TEST_CENTRAL_DB_HOST=localhost
TEST_CENTRAL_DB_PORT=5432
TEST_CENTRAL_DB_NAME=polymir_central_test
TEST_CENTRAL_DB_USER=postgres
TEST_CENTRAL_DB_PASSWORD=postgres

# Test Database - World Server
TEST_WORLD_DB_HOST=localhost
TEST_WORLD_DB_PORT=5432
TEST_WORLD_DB_NAME=polymir_world_test
TEST_WORLD_DB_USER=postgres
TEST_WORLD_DB_PASSWORD=postgres
```

## Mock Services

Test suite includes mocks for external dependencies:

### MockIPFSClient
- Simulates IPFS upload/download
- Stores data in-memory Map
- No real IPFS daemon required

### Mocklibp2pNode
- Simulates libp2p peer-to-peer networking
- Provides pubsub interface
- No real peer connections

### MockDatabase
- In-memory database for unit tests
- Implements same interface as real DB adapters
- No PostgreSQL required for unit tests

## Coverage Goals

**Current:** ~40% (8 test files created)
**Target:** 80% coverage

**Priority Areas Needing Tests:**
1. ✅ Trust system (DONE)
2. ⚠️  Validation consensus (created, pending npm install)
3. ⚠️  Physics system (created, pending npm install)
4. ⚠️  API endpoints (created, pending npm install)
5. ❌ WebSocket handlers (not created)
6. ❌ Database adapters (not created)
7. ❌ IPFS client (not created)
8. ❌ libp2p node (not created)

## Next Steps

1. **Run `npm install`** in backend directory
2. **Fix coordinate system exports** in `src/utils/coordinates.js`
3. **Run all tests** and document failures
4. **Fix failing tests** one by one
5. **Implement TODO items** (JWT, signatures, etc.)
6. **Add missing test files** (WebSocket, DB, IPFS, libp2p)
7. **Achieve 80% coverage**
8. **Set up CI/CD** with automated testing

## Known Issues

1. **npm dependencies not installed** - Blocks all tests except trust.test.js
2. **Coordinate exports mismatch** - Tests expect different function names
3. **Missing test database** - Integration tests will fail without PostgreSQL
4. **TODO items incomplete** - Some backend features are stubs
5. **No E2E tests** - Only unit and integration tests exist

## Test Writing Guidelines

### Unit Tests
- Test single function/class in isolation
- Use mocks for dependencies
- Fast execution (< 1ms per test)
- No external services (DB, IPFS, etc.)

### Integration Tests
- Test multiple components together
- Use real (test) databases when needed
- Moderate execution time (< 100ms per test)
- Can use external services (but clean up after)

### Example Test Structure

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

describe('Feature Name', () => {
    before(() => {
        // Setup before all tests
    });

    after(() => {
        // Cleanup after all tests
    });

    describe('functionName', () => {
        it('should do X when Y', () => {
            const result = functionName(input);
            assert.strictEqual(result, expected);
        });

        it('should throw error when invalid input', () => {
            assert.throws(
                () => functionName(invalidInput),
                Error
            );
        });
    });
});
```

## Continuous Integration

**Recommended CI Pipeline:**

```yaml
# .github/workflows/test.yml
name: Backend Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd backend && npm install
      - run: cd backend && npm test
```

## Production Readiness Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] 80%+ code coverage
- [ ] All TODO items implemented
- [ ] Database migrations tested
- [ ] Error handling tested
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] CI/CD pipeline configured

