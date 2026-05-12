---
name: embedded
description: Set up Prismatic embedding — marketplace, workflow builder, or custom UI — in your web application
agent: embedded-advisor
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, TaskCreate, TaskUpdate, TaskList, TaskGet
---

$ARGUMENTS

<rules context="command" critical="true">
  <rule name="backend-signing">
    <always>Ensure all JWT signing code runs on the backend — never generate frontend signing code</always>
    <never>Expose private signing keys in generated source code or conversation output</never>
  </rule>
  <rule name="reference-before-code">
    <always>Read the relevant embedded-patterns skill reference file before generating any code</always>
    <never>Generate JWT endpoints, SDK setup, or framework integration code from memory alone</never>
  </rule>
  <rule name="one-step-at-a-time">
    <always>Follow the guided setup flow — understand stack, then signing keys, then backend, then frontend</always>
    <never>Skip steps or generate all code at once without confirming the user's stack and preferences</never>
  </rule>
</rules>
