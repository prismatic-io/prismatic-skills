# Custom Marketplace UI

## When to Build a Custom UI

The embedded marketplace iframe covers most use cases and gives you theming control. Build a fully custom marketplace UI when you need:

- Your integrations rendered as native UI elements (cards, lists, tables) that match your design system exactly
- Custom interaction patterns that don't fit the iframe model
- Deep integration with your app's state management or routing

## Architecture

A custom marketplace UI queries Prismatic's API for integration data, renders your own UI components, and then delegates configuration back to Prismatic (the config wizard is too complex to replicate — use `prismatic.configureInstance()` for that).

```
Your custom UI component
    │
    │  prismatic.graphqlRequest({ query: "..." })
    ▼
Prismatic GraphQL API
    │  Returns integration list with status
    ▼
Your UI renders integration cards/list/table
    │
    │  User clicks "Configure" → prismatic.configureInstance(...)
    ▼
Prismatic config wizard (iframe/popover)
```

## Fetching Marketplace Integrations

```typescript
import prismatic from "@prismatic-io/embedded";

const GET_MARKETPLACE_INTEGRATIONS = `
  query getMarketplaceIntegrations {
    marketplaceIntegrations(includeActiveIntegrations: true) {
      nodes {
        id
        name
        allowMultipleMarketplaceInstances
        avatarUrl
        category
        description
        isCustomerDeployable
        marketplaceConfiguration
        overview
        versionNumber
        firstDeployedInstance {
          id
        }
        deployedInstances
        deploymentStatus
      }
    }
  }
`;

const result = await prismatic.graphqlRequest({
  query: GET_MARKETPLACE_INTEGRATIONS,
});
const integrations = result.data.marketplaceIntegrations.nodes;
```

### TypeScript types

```typescript
interface MarketplaceIntegration {
  id: string;
  name: string;
  allowMultipleMarketplaceInstances: boolean;
  avatarUrl?: string;
  category: string;
  description: string;
  isCustomerDeployable: boolean;
  marketplaceConfiguration: string;
  overview: string;
  versionNumber: number;
  firstDeployedInstance?: { id: string };
  deployedInstances: "ZERO" | "ONE" | "MULTIPLE";
  deploymentStatus?: "ACTIVATED" | "PAUSED" | "UNCONFIGURED" | null;
}
```

### Key fields

- `deployedInstances`: `"ZERO"` — not yet configured; `"ONE"` — has one active instance; `"MULTIPLE"` — multiple instances (only for `allowMultipleMarketplaceInstances: true`)
- `deploymentStatus`: `"ACTIVATED"` — enabled and running; `"PAUSED"` — deployed but paused; `"UNCONFIGURED"` — in config wizard but not yet enabled; `null` — not deployed
- `firstDeployedInstance`: the first deployed instance for this customer (if any); useful for opening the existing config
- `includeActiveIntegrations: true` in the query includes customer-specific integrations that aren't in the public marketplace

## Displaying Integration Avatars

Integration avatars are stored in authenticated S3. You can't use `avatarUrl` directly as an `<img src>` — you need to exchange it for a presigned URL.

```typescript
async function getAvatarUrl(
  avatarUrl: string,
  prismaticBaseUrl: string,
  token: string,
): Promise<string> {
  const response = await fetch(`${prismaticBaseUrl}${avatarUrl}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { url } = await response.json();
  // Returns: { "url": "https://s3.amazonaws.com/..." }
  return url;
}
```

The presigned URL is time-limited. Cache it with a TTL shorter than the JWT expiry.

## Opening the Configuration Wizard

Never try to build the config wizard yourself — use Prismatic's implementation:

```typescript
// Configure a new instance (or reconfigure existing) by integration name
prismatic.configureInstance({
  integrationName: integration.name,
  usePopover: true,
});

// If you have the instance ID (from firstDeployedInstance):
prismatic.configureInstance({
  instanceId: integration.firstDeployedInstance.id,
  usePopover: true,
});
```

## Reconfiguring an Existing Instance Inline

`configureInstance` shows the wizard in a popover or the standard instance screen. When a card represents an integration the customer has already configured and you want to drop them straight into the config wizard **inside your own dialog or drawer** — skipping the intermediate instance screen with its "Reconfigure" button — call `editInstanceConfiguration` with the instance ID and a container `selector`. It renders the wizard inline, fires `onSuccess` / `onCancel` / `onDelete` callbacks, and returns a cleanup function to detach its listeners.

```tsx
import { useEffect } from "react";
import prismatic from "@prismatic-io/embedded";

function ReconfigureDialog({
  instanceId,
  onClose,
}: {
  instanceId: string;
  onClose: () => void;
}) {
  const containerId = "edit-instance-config";

  useEffect(() => {
    const cleanup = prismatic.editInstanceConfiguration({
      instanceId,
      selector: `#${containerId}`,
      onSuccess: onClose,
      onCancel: onClose,
      onDelete: onClose,
    });
    return () => cleanup?.();
  }, [instanceId, onClose]);

  return <div id={containerId} style={{ height: "80vh" }} />;
}
```

Use `configureInstance({ integrationName })` for first-time setup from a card, and `editInstanceConfiguration({ instanceId, selector })` to reconfigure an already-deployed instance inline.

## React Example: Custom Card-Based Marketplace

```tsx
import { useEffect, useState } from "react";
import prismatic from "@prismatic-io/embedded";

const GET_INTEGRATIONS = `
  query {
    marketplaceIntegrations(includeActiveIntegrations: true) {
      nodes {
        id name description avatarUrl category
        deployedInstances deploymentStatus
        firstDeployedInstance { id }
      }
    }
  }
`;

function IntegrationCard({
  integration,
  onReconfigure,
}: {
  integration: MarketplaceIntegration;
  onReconfigure: (instanceId: string) => void;
}) {
  const isActive = integration.deploymentStatus === "ACTIVATED";
  const isConfigured = integration.deployedInstances !== "ZERO";

  return (
    <div className="integration-card">
      <h3>{integration.name}</h3>
      <p>{integration.description}</p>
      <span className={`status ${isActive ? "active" : "inactive"}`}>
        {isActive ? "Active" : isConfigured ? "Configured" : "Not connected"}
      </span>
      <button
        onClick={() => {
          if (isConfigured && integration.firstDeployedInstance) {
            onReconfigure(integration.firstDeployedInstance.id);
          } else {
            prismatic.configureInstance({
              integrationName: integration.name,
              usePopover: true,
            });
          }
        }}
      >
        {isConfigured ? "Manage" : "Connect"}
      </button>
    </div>
  );
}

export function CustomMarketplace() {
  const [integrations, setIntegrations] = useState<MarketplaceIntegration[]>(
    [],
  );
  const [reconfiguringInstanceId, setReconfiguringInstanceId] = useState<
    string | null
  >(null);

  useEffect(() => {
    prismatic.graphqlRequest({ query: GET_INTEGRATIONS }).then((result) => {
      setIntegrations(result.data.marketplaceIntegrations.nodes);
    });
  }, []);

  return (
    <div className="integration-grid">
      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.id}
          integration={integration}
          onReconfigure={setReconfiguringInstanceId}
        />
      ))}
      {reconfiguringInstanceId && (
        <ReconfigureDialog
          instanceId={reconfiguringInstanceId}
          onClose={() => setReconfiguringInstanceId(null)}
        />
      )}
    </div>
  );
}
```

## Filtering in Custom UI

Since you control the rendering, you can filter however you like:

```typescript
// Filter by category
const erpIntegrations = integrations.filter((i) => i.category === "ERP");

// Filter to only active integrations
const activeIntegrations = integrations.filter(
  (i) => i.deploymentStatus === "ACTIVATED",
);

// Filter to only not-yet-connected integrations
const availableIntegrations = integrations.filter(
  (i) => i.deployedInstances === "ZERO",
);
```

## Listening for Config Events

Even in a custom marketplace, use the event listener to react to config wizard outcomes:

```typescript
import { PrismaticMessageEvent } from "@prismatic-io/embedded";

window.addEventListener("message", (event) => {
  if (event.data.event === PrismaticMessageEvent.INSTANCE_DEPLOYED) {
    // Refetch integrations to reflect updated status
    fetchIntegrations();
  }
  if (event.data.event === PrismaticMessageEvent.INSTANCE_DELETED) {
    fetchIntegrations();
  }
});
```
