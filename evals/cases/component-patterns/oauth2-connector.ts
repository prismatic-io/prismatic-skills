import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

export default defineEvalCase({
  id: "component-patterns/oauth2-connector",
  prompt: withSkill(
    "component-patterns",
    `Scaffold a minimal Prismatic connector component for an API that authenticates
with OAuth 2.0 (authorization code flow). Write the connection definition to a
TypeScript file in the current working directory. I only need the OAuth2
connection itself — wire up the connection key, display, oauth2Type, and the
standard authorize/token/scopes/clientId/clientSecret inputs. Keep it minimal.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 120_000,
    maxInterrupts: 2,
  }),
  ...scripted,
  assertions: [
    {
      type: "glob-count",
      name: "writes at least one TypeScript source file",
      glob: "**/*.ts",
      min: 1,
    },
    {
      type: "command-exits-zero",
      name: "connection uses oauth2Connection() from spectral",
      command: "grep -rq 'oauth2Connection' --include='*.ts' --exclude-dir=node_modules .",
    },
    {
      type: "rubric",
      name: "OAuth2 path: oauth2Connection + simple key + OAuth2Type",
      criteria:
        'The scaffolded connection uses oauth2Connection() imported from @prismatic-io/spectral, NOT the generic connection() helper, for the OAuth2 auth. It sets oauth2Type to OAuth2Type.AuthorizationCode (OAuth2Type also imported from @prismatic-io/spectral). The connection key is a simple camelCase name such as "oauth2" (or "oauth"/"oauth2Auth") — it MUST NOT be a prefixed/kebab name like "component-oauth2". Fails if the answer reaches for connection() for the OAuth flow, omits oauth2Type, or uses a component-prefixed connection key.',
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "oauth2", "connection", "build"] },
});
