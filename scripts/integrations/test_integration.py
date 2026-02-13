#!/usr/bin/env python3
"""
test_integration.py

PURPOSE: Run test execution of deployed integration

USAGE: python test_integration.py <integration-id> [flow-name] [--payload <file>] [--content-type <type>]

PARAMETERS:
  integration-id       - Integration ID from Prismatic
  flow-name            - Optional: Specific flow to test
  --payload <file>     - Optional: Path to payload file (JSON, XML, etc.)
  --content-type <type> - Optional: Content-Type for payload (default: application/json)

EXIT CODES:
  0 - Success: Test execution completed successfully (or multiple flows found for user to choose)
  1 - Error: Integration ID not provided
  2 - Error: Test execution failed
  3 - Error: No flows found or flow listing failed

BEHAVIOR:
  - If flow-name provided: Tests that specific flow
  - If 1 flow exists: Tests it automatically
  - If multiple flows exist: Lists them and prompts Claude to ask user which to test
  - Automatically detects webhook triggers and suggests appropriate test payloads
  - Uses --cni-auto-end to automatically detect CNI flow completion
  - Uses --tail-logs, --tail-results, --debug, and --jsonl for structured output

WORKFLOW FOR MULTIPLE FLOWS:
  1. First run: Lists available flows and exits
  2. Claude asks user which flow to test
  3. Second run: Tests the chosen flow with flow-name parameter

PAYLOAD HANDLING:
  - Reads test-data/trigger-config.json to determine webhook trigger requirements
  - Automatically locates test payloads based on trigger metadata
  - Falls back to no payload if metadata file not found

"""

import json
import os
import subprocess
import sys

SHARED_DIR = os.path.join(os.path.dirname(__file__), '..', 'shared')
sys.path.insert(0, SHARED_DIR)

from graphql import ensure_authenticated, GraphQLError
from prism_retry import run_prism_query


def _load_trigger_metadata(integration_dir, flow_stable_key):
    """Load trigger metadata from test-data/trigger-config.json.

    Returns dict with keys:
        - needs_payload: bool - Whether this flow expects a webhook payload
        - content_type: str - Content type for payload
        - sample_payload: str - Path to existing sample payload file, or None
    """
    result = {
        "needs_payload": False,
        "content_type": "application/json",
        "sample_payload": None,
    }

    if not integration_dir or not os.path.isdir(integration_dir):
        return result

    metadata_file = os.path.join(integration_dir, "test-data", "trigger-config.json")
    if not os.path.exists(metadata_file):
        return result

    try:
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        flows = metadata.get("flows", {})

        # Validate flows is a dict, not a list
        if not isinstance(flows, dict):
            print(
                f"⚠️  Invalid trigger-config.json: 'flows' must be an object/dict, not {type(flows).__name__}"
            )
            print('   Expected format: {"flows": {"flow-key": {...}}}')
            print("   See: references/trigger-metadata-spec.md for correct format")
            return result

        # Try to find the flow by stable key or name
        flow_config = None
        found_key = None
        if flow_stable_key and flow_stable_key in flows:
            flow_config = flows[flow_stable_key]
            found_key = flow_stable_key
        else:
            # Search by name if stable key doesn't match
            for key, config in flows.items():
                if config.get("name") == flow_stable_key:
                    flow_config = config
                    found_key = key
                    break

        if not flow_config:
            return result

        # Check if this is a webhook flow
        trigger_type = flow_config.get("triggerType", "manual")
        if trigger_type != "webhook":
            return result

        webhook_config = flow_config.get("webhook", {})
        if not webhook_config.get("expectsPayload", False):
            return result

        # Extract webhook configuration
        result["needs_payload"] = True
        result["content_type"] = webhook_config.get("contentType", "application/json")

        # Look for existing payload file in test-data/<flow-key>/
        if found_key or flow_stable_key:
            flow_identifier = found_key or flow_stable_key
            payload_path = _find_existing_payload_file(integration_dir, flow_identifier)
            if payload_path:
                result["sample_payload"] = payload_path
            else:
                print(
                    f"⚠️  No test payload found at test-data/{flow_identifier}/sample-payload.*"
                )
                print("   Expected during Phase 3 code generation")

    except Exception as e:
        print(f"⚠️  Could not load trigger metadata: {e}")

    return result


def _find_existing_payload_file(integration_dir, flow_key):
    """Find existing test payload file for a flow.

    Args:
        integration_dir: Integration directory path
        flow_key: Flow stable key

    Returns:
        Path to existing payload file, or None if not found
    """
    if not integration_dir or not flow_key:
        return None

    test_data_dir = os.path.join(integration_dir, "test-data", flow_key)

    if not os.path.isdir(test_data_dir):
        return None

    # Look for sample-payload with various extensions
    for ext in [".json", ".xml", ".txt"]:
        payload_file = os.path.join(test_data_dir, f"sample-payload{ext}")
        if os.path.exists(payload_file):
            return payload_file

    return None


def list_flows(integration_id):
    """List available flows for an integration."""
    try:
        result = run_prism_query(
            [
                "prism",
                "integrations:flows:list",
                integration_id,
                "--extended",
                "--output",
                "json",
            ],
            timeout=30,
        )

        if result.returncode == 0 and result.stdout:
            flows = json.loads(result.stdout)
            return flows if isinstance(flows, list) else []
        return []
    except Exception as e:
        print(f"⚠️  Could not list flows: {e}")
        return []


def test_single_flow(flow_name, test_url, payload_file=None, content_type=None):
    """Test a specific flow using its test URL.

    Args:
        flow_name: Name of the flow being tested
        test_url: Test URL for the flow
        payload_file: Optional path to payload file
        content_type: Optional content type for payload
    """
    print(f"🧪 Testing flow: {flow_name}")
    if payload_file:
        print(f"   Using payload: {payload_file} ({content_type})")
    print("")

    try:
        # Build command with optional payload parameters
        cmd = [
            "prism",
            "integrations:flows:test",
            "--flow-url",
            test_url,
            "--tail-logs",
            "--tail-results",
            "--cni-auto-end",  # Automatically stop when CNI flow completes
            "--debug",
            "--jsonl",
        ]

        # Add payload options if provided
        if payload_file and os.path.exists(payload_file):
            cmd.extend(["--payload", payload_file])
            if content_type:
                cmd.extend(["--payload-content-type", content_type])

        print("Test Output:")
        print("-" * 60)

        # Run the test and stream output
        result = subprocess.run(
            cmd,
            env=os.environ,
            text=True,
            capture_output=False,  # Stream directly to console
        )

        print("-" * 60)
        print("")

        # Check result based on exit code
        if result.returncode == 0:
            print(f"✅ Flow '{flow_name}' completed successfully")
            print("")
            return True
        else:
            print(f"❌ Flow '{flow_name}' failed with exit code {result.returncode}")
            print("")
            return False

    except Exception as e:
        print(f"❌ Error testing flow '{flow_name}': {e}")
        return False


def test_integration(
    integration_id,
    specific_flow=None,
    payload_file=None,
    content_type=None,
    integration_dir=None,
):
    """Test integration flows.

    Args:
        integration_id: Prismatic integration ID
        specific_flow: Optional specific flow name to test
        payload_file: Optional payload file path (from CLI)
        content_type: Optional content type (from CLI)
        integration_dir: Optional path to integration source directory for auto-detection
    """
    # Validate integration ID format
    # Prismatic integration IDs are base64-encoded strings that decode to "Integration:{uuid}"
    import base64

    try:
        decoded = base64.b64decode(integration_id).decode("utf-8")
        if not decoded.startswith("Integration:"):
            print("❌ ERROR: Invalid integration ID")
            print("")
            print(f"Received: {integration_id}")
            print(f"Decoded to: {decoded}")
            print("")
            print(
                "Integration IDs must decode to a string starting with 'Integration:'"
            )
            print("")
            print("To get the correct integration ID:")
            print("  prism integrations:list --output json")
            print("")
            print("Copy the 'id' field from your integration.")
            return 2
    except Exception as e:
        print("❌ ERROR: Invalid integration ID format")
        print("")
        print(f"Received: {integration_id}")
        print("")
        print("Integration IDs must be valid base64-encoded strings.")
        print(f"Decode error: {e}")
        print("")
        print("To get the correct integration ID:")
        print("  prism integrations:list --output json")
        print("")
        print("Copy the 'id' field from your integration.")
        return 2

    print(f"🧪 Testing integration: {integration_id}")
    print("")

    # Load authentication credentials (token and URL)
    try:
        ensure_authenticated()
    except GraphQLError as e:
        print(f"❌ {e}")
        return 2

    # Initialize payload detection variables
    # Note: For automatic single-flow testing, metadata will be loaded later
    # after flow discovery to ensure we have the correct flow name
    detected_payload = None
    detected_content_type = None
    if not payload_file and integration_dir and specific_flow:
        # Only load metadata now if we have a specific flow name
        requirements = _load_trigger_metadata(integration_dir, specific_flow)
        if requirements["needs_payload"]:
            detected_payload = requirements["sample_payload"]
            detected_content_type = requirements["content_type"]
            if detected_payload:
                print(
                    f"🔍 Loaded trigger metadata: webhook expecting {detected_content_type}"
                )
                print(f"   Generated test payload: {detected_payload}")
                print("")

    # Use provided payload/content-type, or fall back to detected
    final_payload = payload_file or detected_payload
    final_content_type = content_type or detected_content_type

    # If specific flow provided, test only that flow
    if specific_flow:
        print(f"Finding flow: {specific_flow}")
        flows = list_flows(integration_id)

        if not flows:
            print("❌ Could not list flows")
            return 2

        # Find the matching flow
        matching_flow = None
        for flow in flows:
            if flow.get("name") == specific_flow:
                matching_flow = flow
                break

        if not matching_flow:
            print(f"❌ Flow '{specific_flow}' not found")
            print("")
            print("Available flows:")
            for flow in flows:
                print(f"  - {flow.get('name')}")
            return 2

        if not matching_flow.get("testUrl"):
            print(f"❌ No test URL available for flow '{specific_flow}'")
            return 2

        success = test_single_flow(
            specific_flow, matching_flow["testUrl"], final_payload, final_content_type
        )
        if success:
            print("")
            print("📋 Next steps:")
            print("  - Review test results above")
            print("  - Verify the integration behaved as expected")
            return 0
        else:
            print("")
            print("💡 Troubleshooting:")
            print("  - Check integration logs in Prismatic web app")
            print("  - Verify all required connections are configured")
            print("  - Update code and redeploy if needed (Phase 6: Iteration)")
            return 2

    # Otherwise, list flows for user to choose
    print("Discovering flows...")
    flows = list_flows(integration_id)

    if not flows:
        print("❌ No flows found or could not list flows")
        print("")
        print("Possible causes:")
        print("  - Integration ID is incorrect")
        print("  - Integration has no flows configured")
        print("  - Network or authentication issues")
        return 3

    # Single flow - test it automatically
    if len(flows) == 1:
        flow = flows[0]
        flow_name = flow.get("name") or flow.get("stableKey", "unnamed-flow")
        test_url = flow.get("testUrl")

        if not test_url:
            print(f"❌ No test URL available for flow '{flow_name}'")
            return 2

        print(f"Found 1 flow: {flow_name}")

        # Now that we have the flow name, reload trigger metadata if needed
        if not payload_file and integration_dir and not final_payload:
            requirements = _load_trigger_metadata(integration_dir, flow_name)
            if requirements["needs_payload"]:
                final_payload = requirements["sample_payload"]
                final_content_type = requirements["content_type"]
                if final_payload:
                    print(
                        f"🔍 Loaded trigger metadata: webhook expecting {final_content_type}"
                    )
                    print(f"   Generated test payload: {final_payload}")
                    print("")

        print("Testing automatically...")
        print("")
        success = test_single_flow(
            flow_name, test_url, final_payload, final_content_type
        )
        if success:
            print("")
            print("📋 Next steps:")
            print("  - Review test results above")
            print("  - Verify the integration behaved as expected")
            print("  - Ready for Phase 7: Delivery (package for download)")
            return 0
        else:
            print("")
            print("💡 Troubleshooting:")
            print("  - Check integration logs in Prismatic web app")
            print("  - Update code and redeploy if needed (Phase 6: Iteration)")
            return 2

    # Multiple flows - list them and exit for user to choose
    print(f"Found {len(flows)} flows in this integration:")
    print("")
    for i, flow in enumerate(flows, 1):
        flow_name = flow.get("name") or flow.get("stableKey")
        description = flow.get("description", "")
        print(f"{i}. {flow_name}")
        if description:
            print(f"   {description}")
    print("")
    print("=" * 60)
    print("MULTIPLE FLOWS FOUND")
    print("=" * 60)
    print("")
    print("Please specify which flow to test by re-running with:")
    print(f"  python scripts/test_integration.py {integration_id} <flow-name>")
    print("")
    print("Available flow names:")
    for flow in flows:
        flow_name = flow.get("name") or flow.get("stableKey")
        print(f"  - {flow_name}")
    print("")
    print("💡 Claude: Ask the user which flow they want to test, then re-run")
    print("   the script with the chosen flow name as the second argument.")
    return 0


def main():
    if len(sys.argv) < 2:
        print("❌ No integration ID provided")
        print("")
        print(
            "Usage: python test_integration.py <integration-id> [flow-name] [--payload <file>] [--content-type <type>] [--integration-dir <dir>]"
        )
        print("")
        print("Examples:")
        print("  # Test all flows")
        print("  python test_integration.py SW50ZWdyYXRpb246...")
        print("")
        print("  # Test specific flow")
        print("  python test_integration.py SW50ZWdyYXRpb246... hello-world-flow")
        print("")
        print("  # Test with custom payload")
        print(
            "  python test_integration.py SW50ZWdyYXRpb246... webhook-flow --payload /path/to/payload.json"
        )
        print("")
        print("  # Test with custom XML payload")
        print(
            "  python test_integration.py SW50ZWdyYXRpb246... webhook-flow --payload /path/to/payload.xml --content-type application/xml"
        )
        print("")
        print("  # Auto-detect payload from integration source")
        print(
            "  python test_integration.py SW50ZWdyYXRpb246... webhook-flow --integration-dir /home/claude/my-integration"
        )
        return 1

    # Parse arguments
    integration_id = sys.argv[1]
    specific_flow = None
    payload_file = None
    content_type = None
    integration_dir = None

    # Parse positional and optional arguments
    i = 2
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--payload" and i + 1 < len(sys.argv):
            payload_file = sys.argv[i + 1]
            i += 2
        elif arg == "--content-type" and i + 1 < len(sys.argv):
            content_type = sys.argv[i + 1]
            i += 2
        elif arg == "--integration-dir" and i + 1 < len(sys.argv):
            integration_dir = sys.argv[i + 1]
            i += 2
        elif not arg.startswith("--") and specific_flow is None:
            specific_flow = arg
            i += 1
        else:
            i += 1

    return test_integration(
        integration_id, specific_flow, payload_file, content_type, integration_dir
    )


if __name__ == "__main__":
    sys.exit(main())
