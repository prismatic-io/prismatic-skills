---
name: build-component
description: Build and deploy a Prismatic custom component
context: fork
agent: component-builder
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebFetch, WebSearch, Task
---

Build a Prismatic custom component for $ARGUMENTS.

1. Run prerequisites check
2. Gather requirements (ask user for component details)
3. Scaffold the component
4. Generate code based on requirements and reference patterns
5. Build and publish to Prismatic
6. Return summary of what was created
