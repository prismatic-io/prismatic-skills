# Additional Embedded Screens

Beyond the marketplace and workflow builder, Prismatic provides several more embeddable screens.

## Common Options

All screen methods share these options:

```typescript
interface CommonOptions {
  selector?: string;          // CSS selector for container element (required when usePopover is false)
  usePopover?: boolean;       // Default: true for most screens
  theme?: "LIGHT" | "DARK";
  autoFocusIframe?: boolean;  // Auto-focus iframe on load (improves keyboard nav)
  filters?: Filters;
  screenConfiguration?: ScreenConfiguration;
  translation?: Translation;
}
```

## Customer Dashboard

A comprehensive management screen showing integrations, instances, connections, executions, and logs in one place.

```typescript
prismatic.showDashboard({
  selector: "#dashboard-div",
  usePopover: false,
});
```

### Hiding tabs

```typescript
prismatic.showDashboard({
  selector: "#dashboard-div",
  screenConfiguration: {
    dashboard: {
      hideTabs: [
        "Attachments",
        "Components",
        // Other options: "Credentials", "Executions", "Instances",
        //                "Integrations", "Logs", "Marketplace"
      ],
    },
  },
});
```

### Filtering the marketplace section

```typescript
prismatic.showDashboard({
  selector: "#dashboard-div",
  filters: {
    marketplace: {
      category: "Data Platforms",
      label: "featured",
    },
  },
});
```

## Connections Screen

Lets customers manage reusable connections (OAuth tokens, API keys, etc.) that can be shared across their workflows.

```typescript
prismatic.showConnections({
  selector: "#connections-div",
  usePopover: false,
});
```

Connections in the embedded workflow builder are scoped per-customer and reusable across all of their workflows.

## Component Screens

### Browse all components

```typescript
prismatic.showComponents({
  selector: "#components-div",
  usePopover: false,
});
```

Filter by category or label:

```typescript
prismatic.showComponents({
  selector: "#components-div",
  filters: {
    components: {
      category: "Data Platforms",
      label: "official",
    },
  },
});
```

### Show a specific component

```typescript
prismatic.showComponent({
  componentId: "Q29tcG9uZW50Oi...", // Prismatic component ID
  usePopover: true,
});
```

## Logs Screen

Show execution logs for all instances and workflows belonging to the authenticated customer.

```typescript
prismatic.showLogs({
  selector: "#logs-div",
  usePopover: false,
});
```

## Embedding Without the SDK

For frontend stacks that can't use npm packages, all screens can be embedded as plain iframes.

### Core approach

1. Call your backend endpoint to get a signed JWT
2. POST to `https://app.prismatic.io/embedded/authenticate` with `Authorization: Bearer <JWT>` to validate and create the customer user
3. Set the iframe `src` to the appropriate Prismatic URL with `?jwt=<JWT>&embedded=true`

### URL routes

| Screen | URL |
|--------|-----|
| Marketplace | `https://app.prismatic.io/integration-marketplace/` |
| Dashboard | `https://app.prismatic.io/dashboard/` |
| Connections | `https://app.prismatic.io/customer-connections/` |
| Components | `https://app.prismatic.io/components/` |
| Logs | `https://app.prismatic.io/logs/` |
| Workflow list | `https://app.prismatic.io/workflows/` |
| Workflow builder | `https://app.prismatic.io/builder/<workflowId>/` |

### Example (vanilla HTML)

```html
<html>
<head>
  <script>
    addEventListener("load", async () => {
      const baseUrl = "https://app.prismatic.io";

      // Fetch JWT from YOUR backend — never sign on the frontend
      const { token } = await fetch("/api/integration-token").then(r => r.json());

      // Authenticate first
      await fetch(`${baseUrl}/embedded/authenticate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        mode: "no-cors",
      });

      // Set iframe URL
      const url = new URL(`${baseUrl}/integration-marketplace/`);
      url.searchParams.set("jwt", token);
      url.searchParams.set("embedded", "true");
      url.searchParams.set("theme", "LIGHT");

      document.getElementById("prismatic-iframe").src = url.toString();
    });
  </script>
  <style>
    #prismatic-iframe { width: 100%; height: 80vh; border: none; }
  </style>
</head>
<body>
  <iframe id="prismatic-iframe" src="about:blank"></iframe>
</body>
</html>
```
