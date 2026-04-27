# Trigger Metadata Specification

## Purpose

During code generation (Phase 3), the agent creates a trigger metadata file that describes what each flow's trigger expects. This artifact is used during testing (Phase 4-5) to automatically locate and provide appropriate test payloads.

---

## File Location

```
<integration-dir>/test-data/trigger-config.json
```

**Example:**

```
/home/claude/my-integration/test-data/trigger-config.json
```

**Note:** This file lives in the `test-data/` directory alongside the flow-specific test payloads, keeping all test artifacts organized in one location.

---

## File Format

```json
{
  "version": "1.0",
  "flows": {
    "flow-stable-key": {
      "name": "Human-readable flow name",
      "triggerType": "webhook|schedule|manual",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/json|application/xml|application/x-www-form-urlencoded|text/plain",
        "samplePayload": {
          "event": "test",
          "data": {
            "id": "test-123",
            "message": "Sample webhook payload"
          }
        }
      }
    }
  }
}
```

---

## Field Definitions

### Root Level

- **`version`** (string, required): Spec version, currently `"1.0"`
- **`flows`** (object, required): Map of flow stable keys to flow metadata

### Flow Metadata

- **`name`** (string, required): Human-readable flow name
- **`triggerType`** (string, required): One of:
  - `"webhook"` - HTTP webhook trigger
  - `"schedule"` - Scheduled/cron trigger
  - `"manual"` - Manual execution only
- **`webhook`** (object, optional): Required if `triggerType` is `"webhook"`

### Webhook Configuration

- **`expectsPayload`** (boolean, required): Whether trigger expects a request body
- **`contentType`** (string, required if `expectsPayload=true`): Expected Content-Type header
  - Common values: `"application/json"`, `"application/xml"`, `"application/x-www-form-urlencoded"`, `"text/plain"`
- **`samplePayload`** (object/string, optional): Sample payload for testing
  - For JSON: Use object literal
  - For XML/text: Use string with example content

---

## Examples

### Example 1: JSON Webhook Flow

```json
{
  "version": "1.0",
  "flows": {
    "process-github-webhook": {
      "name": "Process GitHub Webhook",
      "triggerType": "webhook",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/json",
        "samplePayload": {
          "action": "opened",
          "pull_request": {
            "id": 123456,
            "title": "Test PR",
            "user": {
              "login": "testuser"
            }
          }
        }
      }
    }
  }
}
```

### Example 2: XML Webhook Flow

```json
{
  "version": "1.0",
  "flows": {
    "receive-xml-notification": {
      "name": "Receive XML Notification",
      "triggerType": "webhook",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/xml",
        "samplePayload": "<?xml version=\"1.0\"?>\n<notification>\n  <event>order.created</event>\n  <orderId>12345</orderId>\n  <timestamp>2025-01-01T00:00:00Z</timestamp>\n</notification>"
      }
    }
  }
}
```

### Example 3: Scheduled Flow

```json
{
  "version": "1.0",
  "flows": {
    "daily-sync": {
      "name": "Daily Data Sync",
      "triggerType": "schedule"
    }
  }
}
```

### Example 4: Multiple Flows

```json
{
  "version": "1.0",
  "flows": {
    "webhook-receiver": {
      "name": "Webhook Receiver",
      "triggerType": "webhook",
      "webhook": {
        "expectsPayload": true,
        "contentType": "application/json",
        "samplePayload": {
          "event": "test",
          "data": {}
        }
      }
    },
    "scheduled-cleanup": {
      "name": "Scheduled Cleanup",
      "triggerType": "schedule"
    },
    "manual-sync": {
      "name": "Manual Data Sync",
      "triggerType": "manual"
    }
  }
}
```

---

## Agent Responsibilities

### During Phase 3 (Code Generation)

When the agent generates integration code, create test artifacts in a single organized directory:

1. **Create `test-data/` directory** in integration root
2. **Generate `test-data/trigger-config.json`** with metadata for each flow
3. **For each flow that needs a test payload, create `.spectral/flows/<flow-stable-key>/payloads/` directory**
4. **Generate `.spectral/flows/<flow-stable-key>/payloads/sample-payload.json`** in VS Code extension format:
   ```json
   {
     "headers": { "content-type": "application/json" },
     "data": { ... actual payload ... },
     "contentType": "application/json"
   }
   ```
5. **Match sample payload to actual code** — the `.data` field must match what the flow's trigger receives

### Sample Payload Guidelines

- **JSON webhooks**: Create realistic JSON file matching expected fields
- **XML webhooks**: Create well-formed XML file with expected elements
- **Form-encoded webhooks**: Create `.txt` file with URL-encoded form data
- **Complex structures**: Include nested objects/arrays if trigger parses them
- **Optional fields**: Include common optional fields with null/default values
- **Keep it simple**: Sample should work for basic testing; user can customize later

### Example File Structure After Phase 3

```
my-integration/
├── src/
│   ├── configPages.ts
│   ├── flows.ts
│   └── index.ts
├── test-data/
│   ├── trigger-config.json           ← Agent creates this
│   ├── webhook-receiver/
│   │   └── sample-payload.json       ← Agent creates this
│   └── slack-command/
│       └── sample-payload.txt        ← Agent creates this
└── package.json
```

**Benefits of this structure:**

- ✅ All test artifacts in one directory (`test-data/`)
- ✅ Easy to exclude from production builds (single directory to ignore)
- ✅ Clear organization: metadata at root, payloads in subdirectories
- ✅ No need for `.prismatic/` directory

---

## Usage During Testing

When testing via MCP `prism_integrations_flows_test`:

1. Read `test-data/trigger-config.json` in the integration directory
2. Read flow metadata for the flow being tested
3. If `triggerType === "webhook"` and `expectsPayload === true`:
   - Read `test-data/<flow-stable-key>/sample-payload.<ext>` file
   - Pass payload content to the MCP test tool
   - Warn if file doesn't exist (should have been created during code generation)
4. If no metadata file exists, proceed with default behavior (no payload)

### Test Artifacts Directory Structure

Test payloads and metadata are organized in a single directory:

```
<integration-dir>/
└── test-data/
    ├── trigger-config.json           ← Metadata for all flows
    ├── flow-stable-key-1/
    │   └── sample-payload.json       ← Test payload for flow 1
    ├── flow-stable-key-2/
    │   └── sample-payload.xml        ← Test payload for flow 2
    └── flow-stable-key-3/
        └── sample-payload.txt         ← Test payload for flow 3
```

**Benefits of this structure:**

- ✅ All test artifacts in one place
- ✅ Easy to exclude from production builds (single `.npmignore` entry)
- ✅ Easy to find test data for specific flows
- ✅ Supports multiple flows with different payload formats
- ✅ Can add additional test artifacts (mock data, fixtures) per flow
- ✅ User can manually edit sample payloads for testing variations

---

## Benefits

- ✅ **Accurate** - Agent knows exact requirements when writing code
- ✅ **Simple** - No code analysis/reverse engineering needed
- ✅ **Flexible** - User can edit sample payloads for specific test cases
- ✅ **Explicit** - Clear documentation of what each trigger expects
- ✅ **Versioned** - Metadata checked into version control with code
- ✅ **Discoverable** - Easy for humans to understand trigger requirements
