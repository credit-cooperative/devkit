#!/usr/bin/env bats

# Tests for scripts/deployments.ts - the Foundry broadcast -> deployments registry extractor

# Load test helpers
load helpers

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

# Check if bun is available
check_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    skip "bun not installed (install: https://bun.sh)"
  fi
}

# Create a fake project root with a package.json in the temp directory
setup_project() {
  echo '{"name": "fixture-project", "version": "9.9.9"}' > "${TEST_TEMP_DIR}/package.json"
}

# Run the extractor against a fixture broadcast file
extract_fixture() {
  local fixture="$1"
  run bun scripts/deployments.ts extract \
    --broadcast "tests/fixtures/${fixture}" \
    --root "$TEST_TEMP_DIR" \
    --out "${TEST_TEMP_DIR}/deployments"
}

# Assert command succeeded
assert_success() {
  if [ "$status" -ne 0 ]; then
    echo "Expected success but got status: $status"
    echo "Output: $output"
    return 1
  fi
}

# Assert the registry file contains a substring
assert_registry_contains() {
  local expected="$1"
  local registry="${TEST_TEMP_DIR}/deployments/84532.json"
  if ! grep -q "$expected" "$registry"; then
    echo "Expected registry to contain: $expected"
    echo "Registry contents:"
    cat "$registry"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@test "extract creates a registry from a broadcast file" {
  check_bun
  setup_project

  extract_fixture "broadcast-v1.json"
  assert_success

  [ -f "${TEST_TEMP_DIR}/deployments/84532.json" ]
  assert_registry_contains '"chain": "base_sepolia"'
  assert_registry_contains '"PaymentRails"'
  assert_registry_contains '"address": "0x00000000000000000000000000000000000000c1"'
  assert_registry_contains '"commit": "abc1234"'
  assert_registry_contains '"blockNumber": 256'
  assert_registry_contains '"version": "9.9.9"'
}

@test "extract emits ABIs for deployed contracts and declared extras" {
  check_bun
  setup_project

  # Foundry artifacts: the deployed contract (PaymentRails) + a factory-created type (RailsFacility)
  mkdir -p "${TEST_TEMP_DIR}/out/PaymentRails.sol" "${TEST_TEMP_DIR}/out/RailsFacility.sol" "${TEST_TEMP_DIR}/deployments"
  echo '{"abi":[{"type":"function","name":"echo","inputs":[],"outputs":[]}]}' > "${TEST_TEMP_DIR}/out/PaymentRails.sol/PaymentRails.json"
  echo '{"abi":[{"type":"function","name":"draw","inputs":[],"outputs":[]}]}' > "${TEST_TEMP_DIR}/out/RailsFacility.sol/RailsFacility.json"
  # RailsFacility has no deployed singleton address — declared so its ABI still ships
  echo '["RailsFacility"]' > "${TEST_TEMP_DIR}/deployments/abi-extras.json"

  extract_fixture "broadcast-v1.json"
  assert_success

  [ -f "${TEST_TEMP_DIR}/deployments/abis/PaymentRails.json" ]   # deployed singleton
  [ -f "${TEST_TEMP_DIR}/deployments/abis/RailsFacility.json" ]  # declared extra (factory-created type)
  grep -q '"draw"' "${TEST_TEMP_DIR}/deployments/abis/RailsFacility.json"
}

@test "extract is idempotent for an unchanged deployment" {
  check_bun
  setup_project

  extract_fixture "broadcast-v1.json"
  assert_success
  extract_fixture "broadcast-v1.json"
  assert_success

  if grep -q '"history"' "${TEST_TEMP_DIR}/deployments/84532.json"; then
    echo "Re-extracting the same broadcast must not create a history entry"
    return 1
  fi
}

@test "redeploying to a new address pushes the old entry into history" {
  check_bun
  setup_project

  extract_fixture "broadcast-v1.json"
  assert_success
  extract_fixture "broadcast-v2.json"
  assert_success

  assert_registry_contains '"address": "0x00000000000000000000000000000000000000c2"'
  assert_registry_contains '"commit": "def5678"'
  assert_registry_contains '"history"'
  assert_registry_contains '"address": "0x00000000000000000000000000000000000000c1"'
  assert_registry_contains '"deprecated"'
}

@test "extract warns about unnamed internally-created contracts" {
  check_bun
  setup_project

  extract_fixture "broadcast-v1.json"
  assert_success

  [[ "$output" == *"has no name in the broadcast file"* ]]
}

@test "check fails when the deployments directory is missing" {
  check_bun

  run bun scripts/deployments.ts check --dir "${TEST_TEMP_DIR}/nonexistent"
  [ "$status" -ne 0 ]
  [[ "$output" == *"deployments directory not found"* ]]
}
