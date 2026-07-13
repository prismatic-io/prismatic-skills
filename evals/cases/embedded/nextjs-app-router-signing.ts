import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Pins the Next.js App Router pattern: server-side RS256 signing plus "use client"
// on the marketplace file. Non-tautology: the prompt names no framework symbol; both
// requirements come only from framework-examples.md.
export default defineEvalCase({
  id: "embedded/nextjs-app-router-signing",
  prompt: withSkill(
    "embedded-patterns",
    `Set up the Prismatic embedded marketplace in our Next.js App Router app. Create the
backend token route that mints the JWT and the client page that renders the marketplace.
Write the files into the current directory. Do not run anything against my account and do
not install any packages.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("embedded-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      glob: "**/*.ts*",
      min: 2,
      name: "wrote at least the server token route and the client page",
    },
    {
      type: "command-exits-zero",
      name: "signs the JWT with RS256",
      command: 'grep -rqE --exclude-dir=node_modules "RS256" .',
    },
    {
      type: "command-exits-zero",
      name: 'any file calling showMarketplace is a "use client" Client Component',
      command: `test -n "$(grep -rlE showMarketplace . --include="*.ts" --include="*.tsx" --exclude-dir=node_modules)" && for f in $(grep -rlE showMarketplace . --include="*.ts" --include="*.tsx" --exclude-dir=node_modules); do grep -q "use client" "$f" || exit 1; done`,
    },
    {
      type: "rubric",
      name: "backend-only RS256 signing, correct call order, Server/Client separation",
      criteria:
        'The token route runs server-side (route.ts), signs the JWT with jsonwebtoken and RS256, loads the key from an env var, and does NOT ship the private key to the client or import @prismatic-io/embedded; the client page is a "use client" Client Component that fetches the token then calls prismatic.init() then prismatic.authenticate({ token }) then prismatic.showMarketplace({ selector }) in order; nothing is executed and no packages installed.',
    },
  ],
  meta: { skill: "embedded-patterns", tags: ["embedded", "nextjs", "app-router", "jwt", "rs256"] },
});
