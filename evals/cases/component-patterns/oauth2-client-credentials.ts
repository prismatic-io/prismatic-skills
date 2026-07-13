import { defineEvalCase } from "@prismatic-io/lux";
import { claudeCode, scripted, skillDir, withSkill } from "../_support.ts";

// Client Credentials grant: server-to-server, no user consent. Non-tautology: the
// prompt names no SDK symbol; the discriminators are the OAuth2Type.ClientCredentials
// enum plus the absence of authorizeUrl, neither of which appears in the prompt.
export default defineEvalCase({
  id: "component-patterns/oauth2-client-credentials",
  prompt: withSkill(
    "component-patterns",
    `Generate the connection definition for a Prismatic custom component that
authenticates to a partner API for server-to-server access. There is no end user in
the loop and no browser-based consent screen — our service exchanges its own
credentials directly for a token. Write just the connection to a TypeScript file in
the current working directory; keep it minimal.`,
  ),
  driver: claudeCode({
    readDirs: [skillDir("component-patterns")],
    idleTimeoutMs: 300_000,
    maxInterrupts: 4,
  }),
  ...scripted,
  assertions: [
    { type: "glob-count", glob: "**/*.ts", min: 1, name: "wrote a TypeScript connection file" },
    {
      type: "command-exits-zero",
      name: "uses the oauth2Connection helper",
      command: 'grep -rq --exclude-dir=node_modules "oauth2Connection" .',
    },
    {
      type: "command-exits-zero",
      name: "selects the ClientCredentials grant enum",
      command: 'grep -rqF --exclude-dir=node_modules "OAuth2Type.ClientCredentials" .',
    },
    {
      type: "command-exits-zero",
      // Anchored on the `authorizeUrl:` key form so an explanatory comment can't fail it.
      name: "declares no authorizeUrl input (client credentials has no browser step)",
      command: '! grep -rqiE --exclude-dir=node_modules "authorizeUrl[[:space:]]*:" .',
    },
    {
      type: "rubric",
      name: "client-credentials connection shape, no authorizeUrl, simple key",
      criteria:
        "The connection uses oauth2Connection() with oauth2Type: OAuth2Type.ClientCredentials (both from @prismatic-io/spectral); its inputs are tokenUrl, clientId, clientSecret (optionally scopes) with no authorizeUrl since client-credentials has no browser authorization step, and its key is a simple camelCase name rather than a component-prefixed or kebab-case key.",
    },
  ],
  meta: { skill: "component-patterns", tags: ["component", "oauth2", "client-credentials"] },
});
