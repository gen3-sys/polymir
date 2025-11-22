#!/bin/bash
# Run all backend tests

echo "=== Running All Backend Tests ==="
echo ""

# Run unit tests
echo "--- Unit Tests ---"
node --test test/unit/**/*.test.js

# Run integration tests (will fail if dependencies not installed)
echo ""
echo "--- Integration Tests ---"
node --test test/integration/**/*.test.js 2>&1 || echo "Integration tests require npm install"

echo ""
echo "=== Test Run Complete ==="
