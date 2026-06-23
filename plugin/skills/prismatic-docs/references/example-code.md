# Prismatic Code Repositories

Two GitHub repositories provide working code references. Choose based on what you need:

| Repository | URL | Use When |
|------------|-----|----------|
| **examples** | `https://github.com/prismatic-io/examples` | Learning patterns, starter code, curated teaching material |
| **components** | `https://github.com/prismatic-io/components` | Production implementations — how Prismatic's own connectors are built |

## prismatic-io/examples

Curated reference implementations for components, integrations, and common patterns. Use it to find working code examples when documentation alone isn't enough.

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

## prismatic-io/components (Production Components)

The open-source repository of Prismatic's own production components. Use this when you need to see how a real, shipped connector handles auth, pagination, error handling, or a specific API.

```
https://github.com/prismatic-io/components/tree/main/components
```

Each subdirectory is a complete component (e.g., `slack/`, `salesforce/`). These are production-grade and reflect current Prismatic SDK best practices.

### When to use `components` instead of `examples`

| Need                                         | Use          |
|----------------------------------------------|--------------|
| Check if an official component already exists | `components` |
| See production auth/pagination/error patterns | `components` |
| Learn patterns from a didactic example        | `examples`   |
| Copy-paste starter structure                  | `examples`   |

### Search pattern

```
repo:prismatic-io/components <service-name>
```

### Fetch raw files

```
https://raw.githubusercontent.com/prismatic-io/components/tree/main/components/<component-name>/src/index.ts
```

## Citation Format

When referencing examples, cite the GitHub URL:

```
See the example implementation at: https://github.com/prismatic-io/examples/tree/main/components/example-name
```

When referencing production components:

```
See the production component: https://github.com/prismatic-io/components/tree/main/components/<component-name>
```

For specific files:

```
Reference: https://github.com/prismatic-io/examples/blob/main/path/to/file.ts
```
