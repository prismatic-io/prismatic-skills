# Framework Integration Examples

## Contents

- [React](#react) — usePrismaticAuth hook, marketplace component
- [Next.js](#nextjs) — API routes (App Router + Pages Router), client components
- [Vue (Composition API)](#vue-composition-api) — composable, marketplace component, Nuxt 3
- [Svelte / SvelteKit](#svelte--sveltekit) — auth store, API endpoint, marketplace page
- [Environment Variables](#environment-variables) — .env setup, multiline PEM keys

## React

### usePrismaticAuth hook

A reusable hook that initializes the SDK, fetches a JWT from your backend, authenticates, and handles re-authentication before expiry.

```typescript
// hooks/usePrismaticAuth.ts
import { useState, useEffect, useCallback, useRef } from "react";
import prismatic from "@prismatic-io/embedded";

interface AuthResult {
  authenticated: boolean;
  error: Error | null;
}

export function usePrismaticAuth(): AuthResult {
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchAndAuthenticate = useCallback(async () => {
    try {
      // Always fetch from your backend — NEVER sign on the frontend
      const { token, expiresAt } = await fetch("/api/integration-token").then(r =>
        r.json()
      );

      await prismatic.authenticate({ token });
      setAuthenticated(true);

      // Schedule re-authentication 60 seconds before expiry
      const msUntilExpiry = expiresAt * 1000 - Date.now();
      timerRef.current = setTimeout(fetchAndAuthenticate, msUntilExpiry - 60_000);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    prismatic.init();
    fetchAndAuthenticate();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchAndAuthenticate]);

  return { authenticated, error };
}
```

### Marketplace component

```tsx
// components/IntegrationMarketplace.tsx
import { useEffect, useRef } from "react";
import prismatic from "@prismatic-io/embedded";
import { usePrismaticAuth } from "../hooks/usePrismaticAuth";

export function IntegrationMarketplace() {
  const { authenticated } = usePrismaticAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (authenticated && !shown.current) {
      shown.current = true;
      prismatic.showMarketplace({
        selector: "#prismatic-marketplace",
        usePopover: false,
      });
    }
  }, [authenticated]);

  return (
    <div
      id="prismatic-marketplace"
      ref={containerRef}
      style={{ width: "100%", height: "80vh" }}
    />
  );
}
```

## Next.js

### Backend: API Route (App Router)

```typescript
// app/api/integration-token/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken"; // npm install jsonwebtoken @types/jsonwebtoken
import { getServerSession } from "next-auth"; // or your auth library

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load from environment — NEVER from client-side code
  const privateKey = process.env.PRISMATIC_SIGNING_KEY!;
  const orgId = process.env.PRISMATIC_ORG_ID!;

  const currentTime = Math.floor(Date.now() / 1000);

  const token = jwt.sign(
    {
      sub: session.user.id,
      external_id: session.user.id,
      name: session.user.name,
      organization: orgId,
      customer: session.user.organizationId,
      customer_name: session.user.organizationName,
      iat: currentTime - 5,   // small buffer for clock skew
      exp: currentTime + 600, // 10 minutes
    },
    privateKey,
    { algorithm: "RS256" }
  );

  return NextResponse.json({ token, expiresAt: currentTime + 600 });
}
```

### Backend: API Route (Pages Router)

```typescript
// pages/api/integration-token.ts
import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { getServerSession } from "next-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: "Unauthorized" });

  const currentTime = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: session.user.id,
      external_id: session.user.id,
      name: session.user.name,
      organization: process.env.PRISMATIC_ORG_ID,
      customer: session.user.organizationId,
      customer_name: session.user.organizationName,
      iat: currentTime - 5,
      exp: currentTime + 600,
    },
    process.env.PRISMATIC_SIGNING_KEY!,
    { algorithm: "RS256" }
  );

  res.json({ token, expiresAt: currentTime + 600 });
}
```

### Frontend: usePrismaticAuth hook (Next.js / Client Component)

```typescript
// hooks/usePrismaticAuth.ts  (mark parent component with "use client")
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import prismatic from "@prismatic-io/embedded";

export function usePrismaticAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchAndAuthenticate = useCallback(async () => {
    // Fetch from the Next.js API route — signing happens server-side
    const { token, expiresAt } = await fetch("/api/integration-token").then(r =>
      r.json()
    );
    await prismatic.authenticate({ token });
    setAuthenticated(true);

    const msUntilExpiry = expiresAt * 1000 - Date.now();
    timerRef.current = setTimeout(fetchAndAuthenticate, msUntilExpiry - 60_000);
  }, []);

  useEffect(() => {
    prismatic.init();
    fetchAndAuthenticate();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchAndAuthenticate]);

  return { authenticated };
}
```

```tsx
// app/integrations/page.tsx
"use client";

import { useEffect } from "react";
import prismatic from "@prismatic-io/embedded";
import { usePrismaticAuth } from "@/hooks/usePrismaticAuth";

export default function IntegrationsPage() {
  const { authenticated } = usePrismaticAuth();

  useEffect(() => {
    if (authenticated) {
      prismatic.showMarketplace({
        selector: "#marketplace",
        usePopover: false,
      });
    }
  }, [authenticated]);

  return <div id="marketplace" style={{ width: "100%", height: "80vh" }} />;
}
```

**Important for Next.js:** The Prismatic SDK uses browser APIs (`window`, `document`). Any file that imports it must be a Client Component (`"use client"`). Never import `@prismatic-io/embedded` in Server Components or API routes.

## Vue (Composition API)

### Composable

```typescript
// composables/usePrismaticAuth.ts
import { ref, onMounted, onUnmounted } from "vue";
import prismatic from "@prismatic-io/embedded";

export function usePrismaticAuth() {
  const authenticated = ref(false);
  const error = ref<Error | null>(null);
  let reAuthTimer: ReturnType<typeof setTimeout>;

  async function fetchAndAuthenticate(): Promise<void> {
    try {
      // Always fetch from your backend — NEVER sign on the frontend
      const { token, expiresAt } = await fetch("/api/integration-token").then(r =>
        r.json()
      );

      await prismatic.authenticate({ token });
      authenticated.value = true;

      // Re-authenticate 60 seconds before expiry
      const msUntilExpiry = expiresAt * 1000 - Date.now();
      reAuthTimer = setTimeout(fetchAndAuthenticate, msUntilExpiry - 60_000);
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    }
  }

  onMounted(() => {
    prismatic.init();
    fetchAndAuthenticate();
  });

  onUnmounted(() => clearTimeout(reAuthTimer));

  return { authenticated, error };
}
```

### Marketplace component

```vue
<!-- components/IntegrationMarketplace.vue -->
<template>
  <div id="prismatic-marketplace" style="width: 100%; height: 80vh;" />
</template>

<script setup lang="ts">
import { watch } from "vue";
import prismatic from "@prismatic-io/embedded";
import { usePrismaticAuth } from "@/composables/usePrismaticAuth";

const { authenticated } = usePrismaticAuth();
let shown = false;

watch(authenticated, (isAuth) => {
  if (isAuth && !shown) {
    shown = true;
    prismatic.showMarketplace({
      selector: "#prismatic-marketplace",
      usePopover: false,
    });
  }
});
</script>
```

### With Nuxt 3

For Nuxt, the JWT signing endpoint goes in `server/api/`:

```typescript
// server/api/integration-token.get.ts
import jwt from "jsonwebtoken";

export default defineEventHandler(async (event) => {
  // Get user from your auth (e.g., nuxt-auth-utils, lucia, etc.)
  const session = await getUserSession(event);
  if (!session?.user) throw createError({ statusCode: 401 });

  const currentTime = Math.floor(Date.now() / 1000);
  const privateKey = process.env.PRISMATIC_SIGNING_KEY!;

  const token = jwt.sign(
    {
      sub: session.user.id,
      external_id: session.user.id,
      name: session.user.name,
      organization: process.env.PRISMATIC_ORG_ID,
      customer: session.user.organizationId,
      customer_name: session.user.organizationName,
      iat: currentTime - 5,
      exp: currentTime + 600,
    },
    privateKey,
    { algorithm: "RS256" }
  );

  return { token, expiresAt: currentTime + 600 };
});
```

## Svelte / SvelteKit

### Auth store and helper

```typescript
// lib/prismaticAuth.ts
import { writable } from "svelte/store";
import prismatic from "@prismatic-io/embedded";

export const prismaticAuthenticated = writable(false);
export const prismaticError = writable<Error | null>(null);

let reAuthTimer: ReturnType<typeof setTimeout>;

async function fetchAndAuthenticate(): Promise<void> {
  try {
    // Always fetch from your backend — NEVER sign on the frontend
    const { token, expiresAt } = await fetch("/api/integration-token").then(r =>
      r.json()
    );

    await prismatic.authenticate({ token });
    prismaticAuthenticated.set(true);

    // Re-authenticate 60 seconds before expiry
    const msUntilExpiry = expiresAt * 1000 - Date.now();
    reAuthTimer = setTimeout(fetchAndAuthenticate, msUntilExpiry - 60_000);
  } catch (err) {
    prismaticError.set(err instanceof Error ? err : new Error(String(err)));
  }
}

export function initPrismatic(): void {
  prismatic.init();
  fetchAndAuthenticate();
}

export function destroyPrismatic(): void {
  clearTimeout(reAuthTimer);
}
```

### SvelteKit: API endpoint for JWT

```typescript
// src/routes/api/integration-token/+server.ts
import type { RequestHandler } from "./$types";
import jwt from "jsonwebtoken";
import { PRISMATIC_SIGNING_KEY, PRISMATIC_ORG_ID } from "$env/static/private";
import { error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals }) => {
  // locals.user set by your auth hooks (e.g., lucia, auth.js, etc.)
  if (!locals.user) throw error(401, "Unauthorized");

  const currentTime = Math.floor(Date.now() / 1000);

  const token = jwt.sign(
    {
      sub: locals.user.id,
      external_id: locals.user.id,
      name: locals.user.name,
      organization: PRISMATIC_ORG_ID,
      customer: locals.user.organizationId,
      customer_name: locals.user.organizationName,
      iat: currentTime - 5,
      exp: currentTime + 600, // 10 minutes
    },
    PRISMATIC_SIGNING_KEY,
    { algorithm: "RS256" }
  );

  return Response.json({ token, expiresAt: currentTime + 600 });
};
```

### Marketplace component

```svelte
<!-- src/routes/integrations/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import prismatic from "@prismatic-io/embedded";
  import {
    initPrismatic,
    destroyPrismatic,
    prismaticAuthenticated,
  } from "$lib/prismaticAuth";

  let shown = false;

  onMount(() => {
    initPrismatic();
  });

  onDestroy(() => {
    destroyPrismatic();
  });

  $: if ($prismaticAuthenticated && !shown) {
    shown = true;
    prismatic.showMarketplace({
      selector: "#prismatic-marketplace",
      usePopover: false,
    });
  }
</script>

<div id="prismatic-marketplace" style="width: 100%; height: 80vh;" />
```

## Environment Variables

For all backends, store credentials as environment variables — never hardcode them:

| Variable | Description |
|----------|-------------|
| `PRISMATIC_SIGNING_KEY` | The RSA private key (PEM format, with newlines) |
| `PRISMATIC_ORG_ID` | Your Prismatic organization ID (from org settings → Embedded tab) |

For the private key in environment variables, preserve newlines. Most platforms accept `\n` or multiline values in `.env` files:

```bash
# .env (never commit this file)
PRISMATIC_ORG_ID=T3JnYW5pemF0aW9uOmU5ZGVhZ...
PRISMATIC_SIGNING_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```
