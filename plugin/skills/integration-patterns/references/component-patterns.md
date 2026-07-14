# Component Manifest Usage Patterns Guide

Quick reference for using Prismatic component manifests in CNI.

## Component Manifest Approach

**Default approach:** For ANY external system integration, use component manifests.

### Always Start With Component Search:

For ALL of these integrations:

- SaaS platforms (Salesforce, Slack, Shopify, HubSpot, etc.)
- Databases (PostgreSQL, MySQL, MongoDB, etc.)
- Cloud providers (AWS, Azure, GCP)
- Communication tools (email, SMS, messaging)
- Any third-party API or service

**Why component manifests are preferred:**

1. **Type-safe access** - IDE autocomplete and compile-time checks
2. **Pre-built OAuth** - No manual token handling
3. **Data sources** - Dynamic dropdowns for channel/folder selection
4. **Maintained** - Auto-updated with component changes
5. **Cleaner code** - No API client boilerplate
6. **Reliability** - Battle-tested authentication patterns

### Only Build Custom When:

- **No component exists** after searching (rare - 200+ components available)
- **Component lacks feature** AND simpler to build from scratch
- **Simple internal API** with trivial authentication

**Rule of thumb:** If you're thinking "should I search for a component?" - the answer is YES.

## Component Manifest Workflow

### 1. Search for Components

Use `prismatic-tools find-components` with a keyword (e.g., "salesforce").
Returns component keys needed for installation.

### 2. Install Manifests During Scaffolding

```bash
scripts/integrations/scaffold-project.ts my-integration --components salesforce,slack
```

Or manually after scaffolding:

```bash
prismatic-tools install-manifest salesforce --project-dir <project-dir>
prismatic-tools install-manifest slack --project-dir <project-dir>
```

### 3. Register Components

```typescript
// src/componentRegistry.ts
import { componentManifests } from "@prismatic-io/spectral";
import salesforce from "./manifests/salesforce";
import slack from "./manifests/slack";

export const componentRegistry = componentManifests({ salesforce, slack });
```

### 4. Configure Connections

```typescript
// src/configPages.ts
import { salesforceOauth2 } from "./manifests/salesforce/connections/oauth2";
import { slackOauth2 } from "./manifests/slack/connections/oauth2";

export const configPages = {
  Connections: configPage({
    elements: {
      "Salesforce Connection": salesforceOauth2("sf-connection", {
        clientId: { value: process.env.SF_CLIENT_ID || "" },
        clientSecret: { value: process.env.SF_CLIENT_SECRET || "" },
      }),
      "Slack Connection": slackOauth2("slack-connection", {
        clientId: { value: process.env.SLACK_CLIENT_ID || "" },
        clientSecret: { value: process.env.SLACK_CLIENT_SECRET || "" },
        scopes: { value: "chat:write channels:read" },
      }),
    },
  }),
};
```

### 5. Use Components in Flows

```typescript
// src/flows.ts
import salesforceActions from "../manifests/salesforce/actions";
import slackActions from "../manifests/slack/actions";

onExecution: async (context, params) => {
  // Query Salesforce
  const result = await salesforceActions.soqlQuery.perform({
    connection: context.configVars["Salesforce Connection"],
    query: "SELECT Id, Name FROM Contact",
  }) as SalesforceQueryResult;

  // Post to Slack
  await slackActions.postMessage.perform({
    connection: context.configVars["Slack Connection"],
    channelName: "general",
    message: `Found ${result.totalSize} contacts`,
  });

  return { data: result };
};
```

## Data Source Helpers

Manifests provide data source helpers for dynamic dropdowns:

```typescript
import { slackSelectChannels } from "./manifests/slack/dataSources/selectChannels";

"Slack Channel": slackSelectChannels("slack-channel", {
  connection: { configVar: "Slack Connection" },
  includePublicChannels: { value: true },
})
```

## Type Handling

Component actions return `unknown`. Define and cast to expected types:

```typescript
import salesforceActions from "../manifests/salesforce/actions";

interface SalesforceQueryResult {
  totalSize: number;
  done: boolean;
  records: Array<{ Id: string; Name: string }>;
}

const result = await salesforceActions.soqlQuery.perform({
  connection: context.configVars["Salesforce Connection"],
  query: "SELECT Id, Name FROM Account",
}) as SalesforceQueryResult;

// Now result is properly typed
console.log(result.totalSize);
```

## Quick Reference by System

| System     | Component Key | Auth Type | Common Actions                       |
| ---------- | ------------- | --------- | ------------------------------------ |
| Salesforce | `salesforce`  | OAuth 2.0 | soqlQuery, createRecord, updateRecord |
| Slack      | `slack`       | OAuth 2.0 | postMessage, listChannels            |
| HubSpot    | `hubspot`     | OAuth 2.0 | getContacts, createDeal              |
| AWS S3     | `aws-s3`      | API Key   | listBuckets, getObject, putObject    |
| SendGrid   | `sendgrid`    | API Key   | sendEmail                            |
| PostgreSQL | `postgresql`  | Basic     | query, insert, update                |

## Complete Guide

See [manifest-pattern.md](manifest-pattern.md) for comprehensive documentation including:

- Complete project structure
- All configuration options
- Error handling patterns
- Troubleshooting guide

## Related Resources

- [Using Components Example](cni-examples/using-components.md) - Complete working example
- [OAuth Connection](cni-examples/oauth-connection.md) - OAuth configuration details
- [Data Sources](cni-examples/data-sources.md) - Dynamic dropdown patterns
- [Component Auth Patterns](cni-examples/component-auth-patterns.md) - Authentication deep dive
