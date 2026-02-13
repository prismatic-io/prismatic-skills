---
name: prismatic-docs
version: 1.0.0
description: This skill should be used when the user asks "How do I...", "What is...", "How does X work in Prismatic?", "What's the best practice for...", wants to understand Prismatic concepts, features, or architecture, or needs guidance on marketplace deployment, customer connections, embedded UI, config pages, triggers, or other Prismatic product features. Search and retrieve documentation from prismatic.io/docs and reference examples from github.com/prismatic-io/examples.
user-invocable: false
---

# Prismatic Documentation

Search and retrieve Prismatic product documentation and code examples to answer conceptual questions, explain features, and provide best-practice guidance.

## Resources

- **Documentation**: `https://prismatic.io/docs/` — Official product documentation
- **Examples**: `https://github.com/prismatic-io/examples` — Working code implementations

## Core Technique: Markdown Fetch

Prismatic docs pages serve clean markdown by appending `.md` to the URL path:

| HTML URL                                    | Markdown URL                                  |
|---------------------------------------------|-----------------------------------------------|
| `https://prismatic.io/docs/connections/`    | `https://prismatic.io/docs/connections.md`    |
| `https://prismatic.io/docs/config-pages/`   | `https://prismatic.io/docs/config-pages.md`   |

The `.md` version strips HTML/CSS/JS, returning clean content ideal for LLM consumption.

## Discovery Methods

### Method 1: Index Lookup (llms.txt)

Fetch the page index to find the right documentation page:

```
https://prismatic.io/docs/llms.txt
```

This contains 200+ page titles with URLs. Search for keywords to find relevant pages.

**Warning**: Do NOT use `llms-full.txt` — it exceeds 10MB and will timeout.

### Method 2: Web Search

Use WebSearch scoped to `prismatic.io` when the topic is unclear:

```
site:prismatic.io/docs <topic>
```

### Method 3: Direct Fetch

For known topics, fetch directly using common paths (see reference file).

## Workflows

### Answer Conceptual Questions

1. Identify the topic from the user's question
2. Check common documentation paths in `references/documentation-search.md`
3. If path unknown, fetch `llms.txt` and search for relevant pages
4. Convert URL to `.md` format and fetch with WebFetch
5. Extract relevant information and present clearly
6. Cite the HTML URL (not `.md`) so users can visit

### Find Code Examples

1. Identify the pattern needed (component, trigger, connection type, etc.)
2. Search `https://github.com/prismatic-io/examples` for relevant examples
3. Fetch raw file content if detailed analysis needed
4. Present code with explanation
5. Cite the GitHub URL

### Answer "How do I..." Questions

1. Search docs for conceptual guidance first
2. Find related examples if code patterns help
3. Combine documentation and examples for complete answer
4. Cite both sources when applicable

## When to Use This Skill

**Use prismatic-docs for:**

- "How do config pages work?"
- "What connection types are available?"
- "Best practices for webhook triggers"
- "How to embed the marketplace"
- "Setup customer-activated connections"
- Code pattern examples

**Use prismatic-api (not this skill) for:**

- "What integrations do I have?"
- "List my customers"
- "Deploy this instance"
- "Show execution logs"

## Common Documentation Paths

| Topic                    | Path                            |
|--------------------------|---------------------------------|
| Config variables         | `/docs/config-variables/`       |
| Config pages             | `/docs/config-pages/`           |
| Connections              | `/docs/connections/`            |
| Customer config          | `/docs/customer-configuration/` |
| Custom components        | `/docs/custom-components/`      |
| Code-native integrations | `/docs/code-native-integrations/`|
| Embedding marketplace    | `/docs/embedding-marketplace/`  |
| Integration triggers     | `/docs/integration-triggers/`   |
| Instances                | `/docs/instances/`              |
| CLI reference            | `/docs/cli/`                    |
| API reference            | `/docs/api/`                    |

See `references/documentation-search.md` for complete paths and task mappings.

## Citation Format

Always cite sources so users can learn more:

**For documentation:**

```
For more details, see: https://prismatic.io/docs/connections/
```

**For examples:**

```
See the example: https://github.com/prismatic-io/examples/tree/main/components/example-name
```

## Key References

- `references/documentation-search.md` — Full documentation paths, common tasks mapping, workflows
- `references/example-code.md` — GitHub examples navigation, search patterns, common categories
