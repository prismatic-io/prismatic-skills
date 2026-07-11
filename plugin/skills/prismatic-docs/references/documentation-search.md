# Prismatic Documentation Search

Reference for searching and retrieving Prismatic product documentation programmatically.

## URL Conversion Rule

Prismatic docs pages serve clean markdown when you replace the trailing `/` with `.md`:

| HTML (for users)                                             | Markdown (for LLM consumption)                                       |
|--------------------------------------------------------------|----------------------------------------------------------------------|
| `https://prismatic.io/docs/`                                 | `https://prismatic.io/docs/index.md`                                 |
| `https://prismatic.io/docs/integrations/`                    | `https://prismatic.io/docs/integrations.md`                          |
| `https://prismatic.io/docs/integrations/config-wizard/config-variables/` | `https://prismatic.io/docs/integrations/config-wizard/config-variables.md` |

The `.md` version strips all HTML, CSS, and JavaScript — returning only clean markdown content ideal for LLM processing.

> **Find URLs via `llms.txt`.** It is the authoritative index of every docs page: fetch it,
> search for your topic, and use the exact `.md` URL it lists. Doc pages live under nested
> sections (e.g. `/docs/integrations/config-wizard/…`), so look the path up there rather than
> assuming one.

## Discovery via llms.txt

Prismatic provides an LLM-optimized page index at:

```
https://prismatic.io/docs/llms.txt
```

This file contains 200+ page titles with their URLs, organized by section. Use it as a sitemap to find the right documentation page when you don't know the exact URL.

**Important**: A full-content version exists at `https://prismatic.io/docs/llms-full.txt` but it exceeds 10MB and will fail or timeout. Always use `llms.txt` (index only) for discovery, then fetch individual pages.

## Workflows

### When You Know the Topic Area

1. Fetch `https://prismatic.io/docs/llms.txt` with WebFetch
2. Search the index for relevant page titles/URLs
3. Fetch the specific page by appending `.md` to the URL path
4. Present the information and cite the HTML URL

### When the Topic Is Unknown

1. Use WebSearch scoped to `prismatic.io` to find relevant pages
2. Take the URL from search results
3. Convert to `.md` URL and fetch with WebFetch
4. Present the information and cite the HTML URL

### Direct Fetch (Known URL)

1. Convert the docs URL: replace trailing `/` with `.md`
2. Fetch with WebFetch
3. Present the information and cite the HTML URL

## Common Documentation Sections

Quick-reference paths for frequently needed topics:

| Topic                        | URL Path                                          |
|------------------------------|---------------------------------------------------|
| Integrations overview        | `/docs/integrations/`                             |
| Config variables             | `/docs/config-variables/`                         |
| Config pages                 | `/docs/config-pages/`                             |
| Connections                  | `/docs/connections/`                              |
| Customer configuration       | `/docs/customer-configuration/`                   |
| Custom components            | `/docs/custom-components/`                        |
| Code-native integrations     | `/docs/code-native-integrations/`                 |
| Embedding (marketplace)      | `/docs/embedding-marketplace/`                    |
| Embedded designer            | `/docs/embedded-designer/`                        |
| CLI / prism                  | `/docs/cli/`                                      |
| API reference                | `/docs/api/`                                      |
| Webhooks & triggers          | `/docs/integration-triggers/`                     |
| Data sources                 | `/docs/data-sources/`                             |
| Logging & monitoring         | `/docs/logging-and-monitoring/`                   |
| Instances                    | `/docs/instances/`                                |
| Customers                    | `/docs/customers/`                                |
| Component manifest           | `/docs/component-manifest/`                       |
| Testing integrations         | `/docs/testing-integrations/`                     |

## Common User Tasks

Map common questions to the right documentation pages:

| User Question / Task                                | Primary Doc Page(s)                              |
|-----------------------------------------------------|--------------------------------------------------|
| "How do I deploy to the marketplace?"               | `/docs/embedding-marketplace/`                   |
| "Setup customer-activated connections"              | `/docs/connections/`, `/docs/customer-configuration/` |
| "How do config pages work?"                         | `/docs/config-pages/`, `/docs/config-variables/` |
| "Create a custom component"                         | `/docs/custom-components/`                       |
| "Build a code-native integration"                   | `/docs/code-native-integrations/`                |
| "Embed Prismatic in my app"                         | `/docs/embedding-marketplace/`, `/docs/embedded-designer/` |
| "Setup webhooks / triggers"                         | `/docs/integration-triggers/`                    |
| "View execution logs"                               | `/docs/logging-and-monitoring/`                  |
| "Deploy an instance to a customer"                  | `/docs/instances/`                               |
| "Configure OAuth connections"                       | `/docs/connections/`                             |
| "Use the Prismatic CLI"                             | `/docs/cli/`                                     |
| "Query the API programmatically"                    | `/docs/api/`                                     |

## When to Search Docs vs Query API vs Examples

| User Question Type                        | Action                      |
|-------------------------------------------|-----------------------------|
| "How do config pages work?"               | Search docs                 |
| "What connection types are available?"    | Search docs                 |
| "Show me component code examples"         | Search examples repo        |
| "What integrations do I have?"            | Query API (MCP/GraphQL)     |
| "Deploy this integration to customer X"   | Query API (MCP/GraphQL)     |
| "What's the best practice for X?"         | Search docs                 |
| "Show me my recent execution logs"        | Query API (MCP/GraphQL)     |
| "How do I set up embedded marketplace?"   | Search docs                 |
| "Example of a webhook trigger flow"       | Search examples repo        |

**Rule of thumb**:

- **Conceptual/how-to/best-practice questions** → Search docs
- **Code patterns and working examples** → Search examples repo
- **Environment-specific queries** → Query API

## Citation Format

Always cite the **HTML URL** (not the `.md` URL) so users can visit the page in their browser:

```
For more details, see: https://prismatic.io/docs/config-variables/
```
