---
name: prismatic-docs
version: 1.0.0
description: This skill should be used when the user asks "How do I...", "What is...", "How does X work in Prismatic?", "What's the best practice for...", wants to understand Prismatic concepts, features, or architecture, or needs guidance on marketplace deployment, customer connections, embedded UI, config pages, triggers, or other Prismatic product features. Search and retrieve documentation from prismatic.io/docs and reference examples from github.com/prismatic-io/examples.
user-invocable: false
---

# Prismatic Documentation

Search and retrieve Prismatic product documentation and code examples to answer conceptual questions, explain features, and provide best-practice guidance.

## Resources

- **Documentation**: `https://prismatic.io/docs/` — Official product documentation
- **Examples**: `https://github.com/prismatic-io/examples` — Working code implementations

## Core Technique: Discover via llms.txt, read via `.md`

Prismatic publishes an authoritative, LLM-optimized index of every docs page:

```
https://prismatic.io/docs/llms.txt
```

It lists 200+ pages as `[Title](full .md URL): one-line description` and is the **single
source of truth for doc URLs**. Each entry carries the page's `.md` URL, which returns clean
markdown (no HTML/CSS/JS) ideal for LLM consumption.

**Look every doc URL up in `llms.txt`; never hand-construct one.** Doc pages live under
nested paths — for example Config Pages is
`https://prismatic.io/docs/integrations/config-wizard/config-pages.md`. Fetch `llms.txt`,
search it for your topic, and fetch the exact `.md` URL it lists.

**Warning**: fetch `llms.txt` (the small index), NOT `llms-full.txt` — it exceeds 10MB and
times out.

**Fallback** (when `llms.txt` doesn't surface the topic): `WebSearch` scoped to
`site:prismatic.io/docs <topic>`, then fetch that page's `.md`.

## Workflows

### Answer Conceptual Questions

1. Identify the topic from the user's question
2. Fetch `llms.txt` and search it for the topic to get the page's exact `.md` URL
3. Fetch that `.md` URL with WebFetch (clean markdown, no HTML/CSS/JS)
4. Extract relevant information and present clearly
5. Cite the page's HTML URL (drop the `.md`) so users can open it in a browser

### Find Code Examples

1. Identify the pattern needed (component, trigger, connection type, etc.)
2. Search `https://github.com/prismatic-io/examples` for relevant examples
3. Fetch raw file content if detailed analysis needed
4. Present code with explanation
5. Cite the GitHub URL

### Answer "How do I..." Questions

1. Search docs for conceptual guidance first
2. Find related examples if code patterns help
3. Combine documentation and examples for complete answer
4. Cite both sources when applicable

## When to Use This Skill

**Use prismatic-docs for:**

- "How do config pages work?"
- "What connection types are available?"
- "Best practices for webhook triggers"
- "How to embed the marketplace"
- "Setup customer-activated connections"
- Code pattern examples

**Use prismatic-api (not this skill) for:**

- "What integrations do I have?"
- "List my customers"
- "Deploy this instance"
- "Show execution logs"

## Finding the right page

**Fetch `llms.txt` and search it for the topic** to get the page's `.md` URL. That one index
covers every doc section — config wizard, connections, custom connectors, code-native,
embed/marketplace, triggers, instances, CLI, API — so it is how you locate any page.

See `references/documentation-search.md` for task→topic mappings and search tips.

## Citation Format

Always cite sources so users can learn more:

**For documentation:**

```
For more details, see: https://prismatic.io/docs/connections/
```

**For examples:**

```
See the example: https://github.com/prismatic-io/examples/tree/main/components/example-name
```

## Key References

- `references/documentation-search.md` — Full documentation paths, common tasks mapping, workflows
- `references/example-code.md` — GitHub examples navigation, search patterns, common categories
