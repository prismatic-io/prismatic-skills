# Prismatic Integration Automation Scripts

Python scripts that automate the Prismatic integration development workflow.

---

## Overview

These scripts handle the deterministic, repetitive tasks in integration development:

- Environment setup and verification
- Project initialization
- Component discovery
- Build and deployment automation
- Testing and troubleshooting

All scripts include comprehensive error handling and user-friendly output.

---

## Script Categories

### Core Setup Scripts

| Script                   | Purpose                            | Phase       | Usage                                  |
| ------------------------ | ---------------------------------- | ----------- | -------------------------------------- |
| `setup_prerequisites.py` | Verify Prism installed & logged in | Phase 1     | `python setup_prerequisites.py <name>` |
| `scaffold_project.py`    | Create project structure           | After Ph2   | `python scaffold_project.py <name>`    |
| `check_prism_access.py`  | Verify network and authentication  | Diagnostics | `python check_prism_access.py`         |

### Component Management

| Script                  | Purpose                                     | Phase   | Usage                                    |
| ----------------------- | ------------------------------------------- | ------- | ---------------------------------------- |
| `search_components.py`  | Search for available components             | Phase 2 | `python search_components.py <keyword>`  |
| `search_connections.py` | Search for integration-agnostic connections | Phase 2 | `python search_connections.py [keyword]` |

### Project Management

| Script                    | Purpose              | Phase   | Usage                                          |
| ------------------------- | -------------------- | ------- | ---------------------------------------------- |
| `install_dependencies.py` | Install npm packages | Phase 1 | `python install_dependencies.py <project-dir>` |

### Build & Deploy

| Script                   | Purpose                               | Phase     | Usage                                         |
| ------------------------ | ------------------------------------- | --------- | --------------------------------------------- |
| `validate_typescript.py` | Fast TypeScript validation (optional) | Phase 3   | `python validate_typescript.py <project-dir>` |
| `build_integration.py`   | Compile TypeScript code               | Phase 4-5 | `python build_integration.py <project-dir>`   |
| `deploy_integration.py`  | Deploy to Prismatic platform          | Phase 4-5 | `python deploy_integration.py <project-dir>`  |

### Testing

| Script                | Purpose                                        | Phase     | Usage                                                                          |
| --------------------- | ---------------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `test_integration.py` | Run test execution with auto-payload detection | Phase 4-5 | `python test_integration.py <integration-id> [flow] [--integration-dir <dir>]` |

### Utilities

| Script                    | Purpose                     | Phase   | Usage                                                    |
| ------------------------- | --------------------------- | ------- | -------------------------------------------------------- |
| `package_for_download.py` | Create distribution package | Phase 7 | `python package_for_download.py <project-dir> <version>` |
| `troubleshoot.py`         | Diagnose common issues      | Phase 6 | `python troubleshoot.py <project-dir>`                   |

---

## Quick Reference by Phase

### Phase 1: Setup & Verification

```bash
python scripts/setup_prerequisites.py <integration-name>
```

The script will:

- Check if Prism CLI is installed (offer to install if not)
- Verify you're logged in to Prismatic
- Display your authenticated user and endpoint

**If not logged in:** Run `prism login` to authenticate.

### Phase 2: Requirements Gathering

```bash
# Search for available components
python scripts/search_components.py salesforce
python scripts/search_components.py slack

# Search for integration-agnostic connections
python scripts/search_connections.py              # List all connections
python scripts/search_connections.py salesforce   # Filter by keyword

# Note component keys and connection stableKeys for Phase 3
```

### After Phase 2: Scaffold Project

```bash
# Scaffold with component manifests
python scripts/scaffold_project.py <integration-name> --components slack,salesforce
```

### Phase 3: Code Generation

Generate code in `src/` directory using component manifests:

```bash
# Manifests are installed during scaffolding via --components flag
# Or install manually after scaffolding:
cd ./my-integration
npx cni-component-manifest slack
npx cni-component-manifest salesforce
```

### Phase 4-5: Build, Deploy & Test

```bash
# Optional: Fast TypeScript validation before building
python scripts/validate_typescript.py ./my-integration

# Build and deploy
python scripts/build_integration.py ./my-integration
python scripts/deploy_integration.py ./my-integration

# Basic test (auto-detects single flow)
python scripts/test_integration.py integration-id-here

# Test specific flow
python scripts/test_integration.py integration-id-here flow-name

# Webhook flow with auto-payload detection
python scripts/test_integration.py integration-id-here webhook-flow --integration-dir ./my-integration

# Custom payload testing
python scripts/test_integration.py integration-id-here webhook-flow --payload /path/to/payload.json
python scripts/test_integration.py integration-id-here webhook-flow --payload /path/to/data.xml --content-type application/xml
```

### Phase 6: Iteration

```bash
python scripts/troubleshoot.py ./my-integration
# Make fixes, then rebuild and redeploy
```

### Phase 7: Delivery

```bash
python scripts/package_for_download.py ./my-integration v1.0.0
```

---

## Script Features

### Error Handling

All scripts include:

- Clear error messages
- Helpful suggestions for resolution
- Proper exit codes (0=success, 1=user error, 2=system error)
- Timeout management for network operations

### Output Formatting

Scripts use emoji and formatting for clarity:

- ✅ Success messages
- ❌ Error messages
- 🔍 Search/discovery operations
- 📦 Package operations
- ⚙️ Build/deploy operations

### Exit Codes

| Code | Meaning      | Example                                  |
| ---- | ------------ | ---------------------------------------- |
| 0    | Success      | Operation completed successfully         |
| 1    | User Error   | Missing required argument, invalid input |
| 2    | System Error | Network failure, not logged in           |

---

## Authentication

Scripts use Prism CLI's native authentication:

- **Standard usage:** Run `prism login` once, and all scripts work automatically
- **Credentials extracted on-demand** from Prism CLI via `prism me` and `prism me:token`
- **No manual token entry required** - the setup script verifies you're logged in

---

## Advanced Features

### Webhook Payload from Trigger Metadata

The `test_integration.py` script automatically uses trigger metadata to provide appropriate test payloads:

**How it works:**

1. Reads `test-data/trigger-config.json` (created by agent in Phase 3)
2. Identifies flow trigger type and expected payload format
3. Loads payload from `test-data/<flow-key>/sample-payload.<ext>`
4. Automatically passes payload to `prism integrations:flows:test`

**Prerequisites:**

- Agent must create `test-data/trigger-config.json` during code generation (Phase 3)
- Webhook flows must have corresponding payload files

**Usage:**

```bash
# Automatically use trigger metadata
python scripts/test_integration.py <integration-id> <flow-name> --integration-dir /path/to/source
```

**Example output:**

```
🔍 Loaded trigger metadata: webhook expecting application/xml

🧪 Testing flow: webhook-flow
   Using payload: test-data/webhook-flow/sample-payload.xml (application/xml)
```

**Manual payload override:**

```bash
python scripts/test_integration.py <id> <flow> --payload /path/to/custom.json --integration-dir ./source
```

**Metadata file format:**

See [../references/trigger-metadata-spec.md](../references/trigger-metadata-spec.md) for complete format specification.

---

## Common Patterns

### Working with Integration-Agnostic Connections

```bash
# Search for available connections
python scripts/search_connections.py salesforce

# Script outputs JSON with stableKey, label, managedBy, etc.
# Use managedBy field to determine:
#   "CUSTOMER" -> customerActivatedConnection() in configPages.ts
#   "ORG"      -> organizationActivatedConnection() in index.ts scopedConfigVars
```

**Complete guide:** [../references/cni-examples/integration-agnostic-connections.md](../references/cni-examples/integration-agnostic-connections.md)

### Working with Component Manifests

```bash
# 1. Search for components
python scripts/search_components.py slack

# 2. Scaffold project with manifests (installs manifests automatically)
python scripts/scaffold_project.py my-integration --components slack,salesforce

# 3. Or install manifests manually after scaffolding
cd ./my-integration
npx cni-component-manifest slack
npx cni-component-manifest salesforce

# 4. Manifests are installed at src/manifests/<component>/
# - Use connection helpers in configPages.ts
# - Use data source helpers for dropdowns
# - Access actions via context.components.<key>.<action>()

# 5. Register manifests in src/componentRegistry.ts
# 6. Include componentRegistry in src/index.ts

# 7. Install dependencies
python scripts/install_dependencies.py ./my-integration
```

### Full Development Cycle

```bash
# Phase 1: Setup (verify Prism installed and logged in, creates session directory)
python scripts/setup_prerequisites.py my-integration

# Phase 2: Requirements gathering (use session path from setup output)
python scripts/gather_requirements.py references/requirements-questions.json <SESSION_DIR>/requirements.json

# Search for components (note component keys for scaffolding)
python scripts/search_components.py slack
python scripts/search_components.py salesforce

# Scaffold project with component manifests
python scripts/scaffold_project.py my-integration --components slack,salesforce

# [Generate code in ~/my-integration/src/]
# - src/componentRegistry.ts (register manifests)
# - src/configPages.ts (use connection/data source helpers)
# - src/flows.ts (access via context.components)
# - src/index.ts (include componentRegistry)

# Build and deploy
python scripts/build_integration.py ~/my-integration
python scripts/deploy_integration.py ~/my-integration

# Test and iterate
python scripts/test_integration.py $INTEGRATION_ID
# [Fix issues]
# [Rebuild and redeploy]

# Package for delivery
python scripts/package_for_download.py . v1.0.0
```

---

## Troubleshooting Scripts

### check_prism_access.py

Verifies:

- Network connectivity to `*.prismatic.io`
- Prism CLI installation
- Authentication status

**When to use**: Before starting any work, or when experiencing network/auth issues

### troubleshoot.py

Diagnoses:

- Common TypeScript errors
- Configuration issues
- Dependency problems
- Build failures

**When to use**: When builds fail or integration doesn't work as expected

---

## Development Notes

### Adding New Scripts

When adding new automation scripts:

1. Include docstring with PURPOSE, USAGE, EXIT CODES
2. Import and use `prism_auth.py` for authentication
3. Use proper exit codes (0, 1, 2)
4. Add helpful error messages
5. Include timeout handling for network operations
6. Update this README

### Script Dependencies

- Python 3.7+
- `prism` CLI tool (installed via npm)
- Standard library modules only (no external dependencies)
