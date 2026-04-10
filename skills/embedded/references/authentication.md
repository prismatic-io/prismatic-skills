# Embedded Authentication

## Contents

- [Security Rule: Always Sign on the Backend](#security-rule-always-sign-on-the-backend)
- [JWT Claims](#jwt-claims) — Required and optional claims, header, example payload
- [Token Lifetime and Re-authentication](#token-lifetime-and-re-authentication)
- [Signing Key Setup](#signing-key-setup) — Generate, import, list
- [Backend Examples](#backend-examples) — Node.js, Python, Ruby, Go, C#
- [Frontend Authentication](#frontend-authentication)

## Security Rule: Always Sign on the Backend

**JWT tokens must be generated and signed on your backend server.** The private signing key must never be exposed to the frontend. Your frontend calls a backend API endpoint to get a signed token string, then passes that token to `prismatic.authenticate()`.

```
Frontend (React/Vue/Svelte/etc.)
    │
    │  GET /api/integration-token (your authenticated session cookie/header)
    ▼
Backend (Node/Python/Ruby/Go/C#)
    │  Signs JWT with private key
    │  Returns { token, expiresAt }
    ▼
Frontend calls:
    prismatic.authenticate({ token })
```

## JWT Claims

### Required claims

| Field | Description |
|-------|-------------|
| `sub` | Unique user ID (UUID or similar) — identifies this specific user |
| `organization` | Your Prismatic organization ID (from the Embedded tab in org settings) |
| `customer` | External ID of the customer this user belongs to (your internal customer ID) |
| `iat` | Issued-at Unix timestamp — use `currentTime - 5` to buffer for clock skew |
| `exp` | Expiry Unix timestamp — **use `currentTime + 600` (10 minutes)** |

### Optional claims

| Field | Description |
|-------|-------------|
| `external_id` | External ID for this user in Prismatic; typically matches `sub` |
| `name` | The user's display name |
| `customer_name` | If a customer with this `customer` external ID doesn't exist yet, creates one with this name |
| `concurrent_execution_limit` | Max concurrent executions for this customer (integer) |
| `role` | For User-Level Configuration (ULC) only: `"admin"` (can deploy) or `"user"` (supplies user config). Defaults to `"admin"`. |

### JWT header

```json
{ "alg": "RS256", "typ": "JWT" }
```

### Example payload

```json
{
  "sub": "2E52B7CB-071B-4EA2-8E9D-F64910EBDBB1",
  "external_id": "2E52B7CB-071B-4EA2-8E9D-F64910EBDBB1",
  "name": "Phil Embedmonson",
  "organization": "T3JnYW5pemF0aW9uOmU5ZGVhZDU5LWU3YzktNDNkMi1hNjhhLWFhMjcyMzEyMTAxNw==",
  "customer": "abc-123",
  "customer_name": "Hooli",
  "iat": 1631676912,
  "exp": 1631677512
}
```

## Token Lifetime and Re-authentication

Keep tokens short-lived (10 minutes). Before expiry, re-fetch a token and re-authenticate:

```typescript
async function fetchAndAuthenticate(): Promise<void> {
  // Always fetch from your backend — never sign on the frontend
  const { token, expiresAt } = await fetch("/api/integration-token")
    .then(r => r.json());

  await prismatic.authenticate({ token });

  // Re-authenticate 60 seconds before expiry
  const msUntilExpiry = expiresAt * 1000 - Date.now();
  setTimeout(fetchAndAuthenticate, msUntilExpiry - 60_000);
}
```

When `prismatic.authenticate({ token })` is called again with a new token, all active embedded iframes are updated automatically — users don't see any disruption.

## Signing Key Setup

### Option 1: Generate via CLI (Prismatic creates the key pair)

```bash
prism organization:signing-keys:generate
```

This outputs the **private key once** — copy it immediately to a secrets manager or environment variable. Prismatic only stores the last 8 characters of the public key.

### Option 2: Import your own key (OpenSSL)

```bash
# Generate a 4096-bit RSA private key
openssl genrsa -out prismatic-signing-key.pem 4096

# Extract the public key
openssl rsa -in prismatic-signing-key.pem -pubout > prismatic-public-key.pub

# Import the public key to Prismatic
prism organization:signing-keys:import -p prismatic-public-key.pub
```

Store the private key (`prismatic-signing-key.pem`) securely — environment variable, AWS Secrets Manager, HashiCorp Vault, etc. Never commit it to source control.

### List existing signing keys

```bash
prism organization:signing-keys:list --extended --output json
```

## Backend Examples

### Node.js (Express)

```javascript
const express = require("express");
const jwt = require("jsonwebtoken"); // npm install jsonwebtoken

const app = express();

// Load private key from environment variable or file
const privateKey = process.env.PRISMATIC_SIGNING_KEY;
// or: const privateKey = require("fs").readFileSync("./prismatic-signing-key.pem", "utf8");

app.get("/api/integration-token", authenticateUser, (req, res) => {
  const currentTime = Math.floor(Date.now() / 1000);

  const token = jwt.sign(
    {
      sub: req.user.id,
      external_id: req.user.id,
      name: req.user.name,
      organization: process.env.PRISMATIC_ORG_ID,
      customer: req.user.organizationId,
      customer_name: req.user.organizationName,
      iat: currentTime - 5,
      exp: currentTime + 600, // 10 minutes
    },
    privateKey,
    { algorithm: "RS256" }
  );

  res.json({ token, expiresAt: currentTime + 600 });
});
```

### Python (FastAPI)

```python
import time
import os
import jwt  # pip install PyJWT cryptography
from fastapi import FastAPI, Depends

app = FastAPI()

with open("prismatic-signing-key.pem", "r") as f:
    private_key = f.read()
# or: private_key = os.environ["PRISMATIC_SIGNING_KEY"]

@app.get("/api/integration-token")
async def get_prismatic_token(current_user = Depends(get_current_user)):
    current_time = int(time.time())

    payload = {
        "sub": str(current_user.id),
        "external_id": str(current_user.id),
        "name": current_user.name,
        "organization": os.environ["PRISMATIC_ORG_ID"],
        "customer": str(current_user.organization_id),
        "customer_name": current_user.organization_name,
        "iat": current_time - 5,
        "exp": current_time + 600,  # 10 minutes
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")
    return {"token": token, "expiresAt": current_time + 600}
```

### Ruby on Rails

```ruby
# Gemfile: gem 'jwt'
require "jwt"
require "openssl"

class Api::PrismaticController < ApplicationController
  before_action :authenticate_user!

  def token
    private_key = OpenSSL::PKey::RSA.new(
      ENV["PRISMATIC_SIGNING_KEY"]
      # or: File.read(Rails.root.join("config", "prismatic-signing-key.pem"))
    )

    current_time = Time.now.to_i

    payload = {
      sub: current_user.id.to_s,
      external_id: current_user.id.to_s,
      name: current_user.full_name,
      organization: ENV["PRISMATIC_ORG_ID"],
      customer: current_user.organization_id.to_s,
      customer_name: current_user.organization.name,
      iat: current_time - 5,
      exp: current_time + 600  # 10 minutes
    }

    token = JWT.encode(payload, private_key, "RS256")
    render json: { token: token, expiresAt: current_time + 600 }
  end
end
```

### Go

```go
package main

import (
  "crypto/rsa"
  "encoding/json"
  "net/http"
  "os"
  "time"

  "github.com/golang-jwt/jwt/v5" // go get github.com/golang-jwt/jwt/v5
)

func prismaticTokenHandler(w http.ResponseWriter, r *http.Request) {
  // Load private key from env or file
  keyBytes := []byte(os.Getenv("PRISMATIC_SIGNING_KEY"))
  // or: keyBytes, _ = os.ReadFile("prismatic-signing-key.pem")

  privateKey, err := jwt.ParseRSAPrivateKeyFromPEM(keyBytes)
  if err != nil {
    http.Error(w, "invalid signing key", http.StatusInternalServerError)
    return
  }

  user := getUserFromContext(r.Context())
  currentTime := time.Now().Unix()

  claims := jwt.MapClaims{
    "sub":           user.ID,
    "external_id":   user.ID,
    "name":          user.Name,
    "organization":  os.Getenv("PRISMATIC_ORG_ID"),
    "customer":      user.OrganizationID,
    "customer_name": user.OrganizationName,
    "iat":           currentTime - 5,
    "exp":           currentTime + 600, // 10 minutes
  }

  token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
  signed, err := token.SignedString(privateKey)
  if err != nil {
    http.Error(w, "signing failed", http.StatusInternalServerError)
    return
  }

  w.Header().Set("Content-Type", "application/json")
  json.NewEncoder(w).Encode(map[string]interface{}{
    "token":     signed,
    "expiresAt": currentTime + 600,
  })
}
```

### C# (.NET)

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PrismaticController : ControllerBase
{
    private readonly IConfiguration _config;

    public PrismaticController(IConfiguration config)
    {
        _config = config;
    }

    [HttpGet("token")]
    public IActionResult GetToken()
    {
        var privateKeyPem = Environment.GetEnvironmentVariable("PRISMATIC_SIGNING_KEY")
            ?? System.IO.File.ReadAllText("prismatic-signing-key.pem");

        var rsa = System.Security.Cryptography.RSA.Create();
        rsa.ImportFromPem(privateKeyPem);

        var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var user = HttpContext.User;

        var claims = new[]
        {
            new Claim("sub",           user.FindFirst("sub")?.Value ?? ""),
            new Claim("external_id",   user.FindFirst("sub")?.Value ?? ""),
            new Claim("name",          user.FindFirst("name")?.Value ?? ""),
            new Claim("organization",  _config["Prismatic:OrgId"] ?? ""),
            new Claim("customer",      user.FindFirst("org_id")?.Value ?? ""),
            new Claim("customer_name", user.FindFirst("company")?.Value ?? ""),
        };

        var key = new RsaSecurityKey(rsa);
        var credentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256);

        var token = new JwtSecurityToken(
            notBefore: DateTime.UtcNow.AddSeconds(-5),
            expires:   DateTime.UtcNow.AddMinutes(10),
            claims:    claims,
            signingCredentials: credentials
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        return Ok(new { token = tokenString, expiresAt = currentTime + 600 });
    }
}
```

## Frontend Authentication

```typescript
import prismatic from "@prismatic-io/embedded";

// Call prismatic.init() once at app startup (before authentication)
prismatic.init();

// Then authenticate:
const { token, expiresAt } = await fetch("/api/integration-token").then(r => r.json());

try {
  await prismatic.authenticate({ token });
  // Now safe to call showMarketplace(), showWorkflows(), etc.
} catch (error) {
  console.error("Prismatic authentication failed:", error);
  // JWT may be malformed, expired, or signed with incorrect key
}
```

`prismatic.authenticate()` throws if the token is invalid or expired.
