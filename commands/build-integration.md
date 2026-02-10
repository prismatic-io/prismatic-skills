---
name: build-integration
description: Build and deploy a Prismatic Code Native Integration (CNI)
context: fork
agent: cni-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Task
---

Build a Prismatic Code Native Integration for $ARGUMENTS.

1. Run prerequisites check
2. Gather requirements (systems, components, connections, flow patterns)
3. Collect OAuth/API credentials if needed
4. Scaffold project with component manifests
5. Generate TypeScript code (componentRegistry, configPages, flows, index)
6. Build, deploy, and test
7. Return summary of what was created
