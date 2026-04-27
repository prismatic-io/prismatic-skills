# Prismatic Authentication Setup

This guide explains how to set up authentication so you can build and deploy integrations to your Prismatic account.

## Overview

Authentication requires:

1. **Prism CLI** installed on your machine
2. **Logged in** to your Prismatic account via Prism CLI

Once logged in, the integration builder can automatically access your Prismatic account.

## Prerequisites

- Node.js and npm installed ([Download](https://nodejs.org))
- Prismatic account ([Sign up](https://prismatic.io))

---

## Step 1: Install Prism CLI

Open a terminal and run:

```bash
npm install -g @prismatic-io/prism
```

**Troubleshooting:**

- If "npm: command not found" → Install Node.js first from <https://nodejs.org/>
- If permission errors → Try with `sudo` (Mac/Linux) or run as Administrator (Windows)
- To verify installation: `prism --version`

---

## Step 2: Log Into Prismatic

In your terminal, run:

```bash
prism login
```

This will:

1. Open your web browser
2. Ask you to log in with your Prismatic credentials
3. Save your authentication information locally

---

## Step 3: Verify Authentication

In your terminal, run:

```bash
prism me
```

You should see your user information:

```
Name:     John Doe
Email:    john@example.com
Organization: My Company
Endpoint URL: https://app.prismatic.io
```

If this works, you're ready to build integrations!

---

## Using with Claude Code

When you start building an integration with Claude Code, the setup script will automatically:

1. Check if Prism CLI is installed
2. Verify you're logged in
3. Use your existing authentication

**You don't need to provide any tokens or URLs manually** - the integration builder extracts credentials directly from your Prism CLI session.

---

## Common Issues

### "prism: command not found"

**Cause:** npm global bin directory not in PATH

**Solution:**

1. Find npm global bin: `npm config get prefix`
2. Add to PATH (varies by OS)
3. Or reinstall with: `npm install -g @prismatic-io/prism`

### Browser doesn't open during login

**Cause:** No default browser configured

**Solution:**

The browser URL will be printed to the terminal. Copy and paste it into a browser manually.

### Authentication expired

**Cause:** Token expired or logged out

**Solution:**

Run `prism login` again to re-authenticate.

### Wrong Prismatic instance

**Cause:** Logged into wrong region or organization

**Solution:**

1. Run `prism logout` to clear current session
2. Run `prism login` and select the correct instance

---

## Official Documentation

For more details, see:

- **Prism CLI Overview**: <https://prismatic.io/docs/cli/prism/>
- **Authentication Guide**: <https://prismatic.io/docs/api/authentication/>
