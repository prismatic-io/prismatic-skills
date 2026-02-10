---
name: component-patterns
description: Architecture patterns, code generation guides, and reference documentation for building Prismatic custom components.
user-invocable: false
---

# Component Patterns

Reference documentation for building Prismatic custom components.

## Component Types

### Utility Components
- Provide helper actions (data transformation, formatting, etc.)
- No external connections needed

### Connector Components (Standard Pattern)
- Wrap external APIs (Salesforce, Canny, HubSpot, etc.)
- Support OAuth2, API Key, Bearer Token auth
- Installed via Prism CLI

## Key References

### Architecture & Workflow
- `references/workflow-phases.md` - Complete phase-by-phase workflow
- `references/component-architecture.md` - Component directory structure
- `references/code-generation-guide.md` - File generation patterns

### Authentication
- `references/authentication-patterns.md` - API Key and OAuth2 patterns
- `references/oauth2-connection-guide.md` - Deep dive on OAuth2 connections

### API Research
- `references/api-research-guide.md` - How to research external APIs
- `references/spectral-component-quickstart.md` - Spectral SDK basics

### Troubleshooting
- `references/troubleshooting-errors.md` - Build/test failure solutions

### Examples
- `references/examples/utility-component/` - Complete utility example
- `references/examples/apikey-connector/` - Connector with API Key auth
- `references/examples/oauth2-connector/` - Connector with OAuth2 auth

## Component Key Patterns

1. **Connection Fields**: Include appropriate auth fields for the target API
2. **Webhook Lifecycle**: Always implement onInstanceDeploy and onInstanceDelete for triggers
3. **Component Key**: Component name in lowercase (e.g., `canny`)
