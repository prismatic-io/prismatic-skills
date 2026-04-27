# Prismatic Examples Repository

Reference for Prismatic's official examples repository containing working code implementations.

## Repository

```
https://github.com/prismatic-io/examples
```

This repository contains reference implementations for components, integrations, and common patterns. Use it to find working code examples when documentation alone isn't enough.

## Key Directories

| Directory          | Contents                                              |
|--------------------|-------------------------------------------------------|
| `components/`      | Custom component examples with actions, triggers, connections |
| `integrations/`    | Code-native integration (CNI) examples                |
| `api-examples/`    | GraphQL API usage examples and scripts                |

## When to Use Examples vs Docs

| Need                                      | Use                        |
|-------------------------------------------|----------------------------|
| Understand a concept                      | Documentation              |
| See working code implementation           | Examples repo              |
| Learn best practices                      | Both (docs + examples)     |
| Find specific action/trigger patterns     | Examples repo              |
| Understand configuration options          | Documentation              |
| Copy-paste starter code                   | Examples repo              |

## Discovery Workflow

### Browse by Category

1. Navigate to `https://github.com/prismatic-io/examples`
2. Read the README for an overview of available examples
3. Browse the relevant directory (`components/`, `integrations/`, etc.)
4. Find the example closest to your use case

### Search for Specific Patterns

Use GitHub search to find specific patterns:

```
repo:prismatic-io/examples <search term>
```

Example searches:

- `repo:prismatic-io/examples oauth` - OAuth connection examples
- `repo:prismatic-io/examples webhook` - Webhook trigger examples
- `repo:prismatic-io/examples pagination` - Pagination handling examples
- `repo:prismatic-io/examples polling` - Polling trigger examples

### Fetch Raw Files

To fetch raw file content for analysis, use the raw GitHub URL pattern:

```
https://raw.githubusercontent.com/prismatic-io/examples/main/<path-to-file>
```

## Common Example Categories

### Component Patterns

| Pattern                    | Look For                                    |
|----------------------------|---------------------------------------------|
| OAuth 2.0 connections      | `components/` with `oauth` in name          |
| API key connections        | `components/` with basic auth patterns      |
| Webhook triggers           | Files with `trigger` and `webhook`          |
| Polling triggers           | Files with `trigger` and `polling`          |
| Data sources               | Files with `dataSource`                     |
| Pagination handling        | Examples using `cursor` or `page`           |

### Integration Patterns

| Pattern                    | Look For                                    |
|----------------------------|---------------------------------------------|
| Bidirectional sync         | `integrations/` with sync patterns          |
| Webhook-triggered flows    | Flows using webhook triggers                |
| Scheduled flows            | Flows using schedule triggers               |
| Multi-step workflows       | Complex flow definitions                    |

## Citation Format

When referencing examples, cite the GitHub URL:

```
See the example implementation at: https://github.com/prismatic-io/examples/tree/main/components/example-name
```

For specific files:

```
Reference: https://github.com/prismatic-io/examples/blob/main/path/to/file.ts
```
