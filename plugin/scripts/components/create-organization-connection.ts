#!/usr/bin/env npx tsx
/**
 * create-organization-connection.ts
 *
 * PURPOSE: Create reusable connections (SCV) via Prismatic GraphQL API.
 * Supports customer-activated, org-activated-customer, and org-activated-global strategies.
 *
 * USAGE: prismatic-tools create-organization-connection \
 *   --component-key <key> \
 *   --connection-key <key> \
 *   --name <name> \
 *   [--strategy <customer-activated|org-activated-customer|org-activated-global>] \
 *   [--stable-key <key>] \
 *   [--credentials '<json>'] \
 *   [--skip-test-connection]
 *
 * EXIT CODES:
 *   0 - Success
 *   1 - Authentication error
 *   3 - API error
 */

import { graphql, ensureAuthenticated, GraphQLError } from "../shared/graphql.js";

const FIND_CONNECTION_QUERY = `
query listComponents($key: String) {
  components(key: $key) {
    nodes {
      id
      key
      connections {
        nodes {
          id
          key
          label
          inputs {
            nodes {
              key
              label
              type
              default
            }
          }
        }
      }
    }
  }
}
`;

const CHECK_EXISTING_QUERY = `
query listScopedConfigVariables($stableKey: String) {
  scopedConfigVariables(stableKey: $stableKey) {
    nodes {
      id
      key
      stableKey
      description
      variableScope
      managedBy
      status
      customerConfigVariables {
        nodes {
          id
          isTest
          status
        }
      }
    }
  }
}
`;

const CREATE_SCOPED_MUTATION = `
mutation createScopedConfigVariable(
  $key: String!
  $description: String!
  $stableKey: String!
  $variableScope: String!
  $managedBy: String!
  $connection: ID!
  $inputs: [InputExpression]
) {
  createScopedConfigVariable(
    input: {
      key: $key
      description: $description
      stableKey: $stableKey
      variableScope: $variableScope
      managedBy: $managedBy
      connection: $connection
      inputs: $inputs
    }
  ) {
    scopedConfigVariable {
      id
      key
      stableKey
      variableScope
      managedBy
      status
    }
    errors {
      field
      messages
    }
  }
}
`;

const CREATE_CUSTOMER_MUTATION = `
mutation createCustomerConfigVariable(
  $scopedConfigVariable: ID!
  $customer: ID
  $isTest: Boolean
  $inputs: [InputExpression]
) {
  createCustomerConfigVariable(
    input: {
      scopedConfigVariable: $scopedConfigVariable
      customer: $customer
      isTest: $isTest
      inputs: $inputs
    }
  ) {
    customerConfigVariable {
      id
      isTest
      status
    }
    errors {
      field
      messages
    }
  }
}
`;

interface ConnectionDef {
  id: string;
  key: string;
  label: string;
  inputs: { nodes: Array<{ key: string; label: string; type: string; default: unknown }> };
}

interface ScopedConfigVar {
  id: string;
  key: string;
  stableKey: string;
  customerConfigVariables?: { nodes: Array<{ id: string; isTest: boolean; status: string }> };
}

function findConnection(
  componentKey: string,
  connectionKey: string,
): { connection: ConnectionDef | null; error: string | null } {
  try {
    const data = graphql(FIND_CONNECTION_QUERY, { key: componentKey }) as Record<string, unknown>;
    const components = ((data.components as Record<string, unknown>)?.nodes ?? []) as Array<
      Record<string, unknown>
    >;

    for (const component of components) {
      if (component.key === componentKey) {
        const connections = ((component.connections as Record<string, unknown>)?.nodes ??
          []) as ConnectionDef[];
        for (const conn of connections) {
          if (conn.key === connectionKey) {
            return { connection: conn, error: null };
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof GraphQLError) {
      return { connection: null, error: e.message };
    }
  }

  return {
    connection: null,
    error: `Connection '${connectionKey}' not found in component '${componentKey}'`,
  };
}

function checkExistingScopedConfigVariable(stableKey: string): ScopedConfigVar | null {
  try {
    const data = graphql(CHECK_EXISTING_QUERY, { stableKey }) as Record<string, unknown>;
    const configs = ((data.scopedConfigVariables as Record<string, unknown>)?.nodes ??
      []) as ScopedConfigVar[];
    for (const config of configs) {
      if (config.stableKey === stableKey) return config;
    }
  } catch {
    // ignore
  }
  return null;
}

// Inputs that the org provides for OAuth connections (not customer-provided)
const ORG_MANAGED_INPUTS = [
  "authorizeUrl",
  "tokenUrl",
  "clientId",
  "clientSecret",
  "scopes",
  "refreshUrl",
  "revokeUrl",
  "audience",
];

function createScopedConfigVariable(
  connectionDef: ConnectionDef,
  name: string,
  stableKey: string,
  strategy: ConnectionStrategy,
  description?: string,
): { result: Record<string, unknown> | null; error: string | null } {
  const variableScope = strategy === "org-activated-global" ? "org" : "customer";
  const managedBy = strategy === "customer-activated" ? "customer" : "org";

  const inputs = (connectionDef.inputs?.nodes ?? []).map((inp) => {
    let meta: Record<string, string> = {};
    if (strategy === "customer-activated") {
      // Org provides OAuth app config, customer provides authorization
      meta = ORG_MANAGED_INPUTS.includes(inp.key)
        ? { managedBy: "org", inputScope: "org" }
        : { managedBy: "customer", inputScope: "customer" };
    } else if (strategy === "org-activated-customer") {
      meta = { managedBy: "org", inputScope: "customer" };
    }
    // org-activated-global: no special meta needed

    return {
      name: inp.key,
      type: "value",
      value: "",
      ...(Object.keys(meta).length > 0 ? { meta: JSON.stringify(meta) } : {}),
    };
  });

  const variables = {
    key: name,
    description: description || `${strategy} connection for ${name}`,
    stableKey,
    variableScope,
    managedBy,
    connection: connectionDef.id,
    inputs,
  };

  try {
    const data = graphql(CREATE_SCOPED_MUTATION, variables, 60) as Record<string, unknown>;
    const mutationResult = (data.createScopedConfigVariable ?? {}) as Record<string, unknown>;

    const errors = mutationResult.errors as
      | Array<{ field: string; messages: string[] }>
      | undefined;
    if (errors?.length) {
      const msgs = errors.map((e) => `${e.field}: ${e.messages.join(", ")}`);
      return { result: null, error: msgs.join("; ") };
    }

    return { result: mutationResult.scopedConfigVariable as Record<string, unknown>, error: null };
  } catch (e) {
    if (e instanceof GraphQLError) return { result: null, error: e.message };
    return { result: null, error: String(e) };
  }
}

function findExistingTestCustomerConfigVariable(
  scopedConfigVar: ScopedConfigVar,
): { id: string } | null {
  const customerVars = scopedConfigVar.customerConfigVariables?.nodes ?? [];
  for (const v of customerVars) {
    if (v.isTest === true) return v;
  }
  return null;
}

function createCustomerConfigVariable(
  scopedConfigVarId: string,
  fieldValues?: Record<string, string>,
): { result: Record<string, unknown> | null; error: string | null } {
  const inputs: Array<{ name: string; type: string; value: string }> = [];
  if (fieldValues) {
    for (const [name, value] of Object.entries(fieldValues)) {
      if (value != null) {
        inputs.push({ name, type: "value", value });
      }
    }
  }

  const variables = {
    scopedConfigVariable: scopedConfigVarId,
    customer: null,
    isTest: true,
    inputs,
  };

  try {
    const data = graphql(CREATE_CUSTOMER_MUTATION, variables, 60) as Record<string, unknown>;
    const mutationResult = (data.createCustomerConfigVariable ?? {}) as Record<string, unknown>;

    const errors = mutationResult.errors as
      | Array<{ field: string; messages: string[] }>
      | undefined;
    if (errors?.length) {
      const msgs = errors.map((e) => `${e.field}: ${e.messages.join(", ")}`);
      return { result: null, error: msgs.join("; ") };
    }

    return {
      result: mutationResult.customerConfigVariable as Record<string, unknown>,
      error: null,
    };
  } catch (e) {
    if (e instanceof GraphQLError) return { result: null, error: e.message };
    return { result: null, error: String(e) };
  }
}

type ConnectionStrategy = "customer-activated" | "org-activated-customer" | "org-activated-global";

function parseArgs(args: string[]): {
  componentKey: string;
  connectionKey: string;
  name: string;
  credentials?: Record<string, string>;
  stableKey?: string;
  strategy: ConnectionStrategy;
  skipTestConnection: boolean;
} {
  let componentKey = "";
  let connectionKey = "";
  let name = "";
  let credentials: Record<string, string> | undefined;
  let stableKey: string | undefined;
  let strategy: ConnectionStrategy = "customer-activated";
  let skipTestConnection = false;

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case "--component-key":
        componentKey = args[++i] ?? "";
        break;
      case "--connection-key":
        connectionKey = args[++i] ?? "";
        break;
      case "--name":
        name = args[++i] ?? "";
        break;
      case "--credentials":
        try {
          credentials = JSON.parse(args[++i] ?? "{}");
        } catch {
          console.error("Invalid JSON for --credentials");
        }
        break;
      case "--stable-key":
        stableKey = args[++i];
        break;
      case "--strategy":
        strategy = (args[++i] ?? "customer-activated") as ConnectionStrategy;
        break;
      case "--skip-test-connection":
        skipTestConnection = true;
        break;
    }
    i++;
  }

  return {
    componentKey,
    connectionKey,
    name,
    credentials,
    stableKey,
    strategy,
    skipTestConnection,
  };
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.componentKey || !parsed.connectionKey || !parsed.name) {
    console.error(
      "Usage: npx tsx create-organization-connection.ts --component-key <key> --connection-key <key> --name <name> [--strategy <customer-activated|org-activated-customer|org-activated-global>] [--credentials '<json>']",
    );
    return 1;
  }

  const stableKey = parsed.stableKey || `${parsed.componentKey}-${parsed.connectionKey}`;

  console.log("=".repeat(60));
  console.log("  Create Organization Connection (Scoped)");
  console.log("=".repeat(60));
  console.log("");
  console.log(`Component: ${parsed.componentKey}`);
  console.log(`Connection: ${parsed.connectionKey}`);
  console.log(`Name: ${parsed.name}`);
  console.log(`Strategy: ${parsed.strategy}`);
  console.log(`Stable Key: ${stableKey}`);
  console.log("");

  // Verify authentication
  try {
    ensureAuthenticated();
  } catch {
    console.log("Error: Not authenticated with Prismatic");
    console.log("Run 'prism login' first");
    return 1;
  }

  console.log("Authenticated with Prismatic");

  let scopedVarExisted = false;
  let customerVarExisted = false;
  let scopedConfigVar: Record<string, unknown> | null = null;
  let customerConfigVar: Record<string, unknown> | null = null;

  // Check if scoped config variable already exists
  console.log("Checking for existing scoped config variable...");
  const existingScoped = checkExistingScopedConfigVariable(stableKey);

  if (existingScoped) {
    console.log(
      `Scoped config variable already exists: ${existingScoped.key} (ID: ${existingScoped.id})`,
    );
    scopedConfigVar = existingScoped as unknown as Record<string, unknown>;
    scopedVarExisted = true;

    const existingTest = findExistingTestCustomerConfigVariable(existingScoped);
    if (existingTest) {
      console.log(`Test customer config variable already exists: ${existingTest.id}`);
      customerConfigVar = existingTest as unknown as Record<string, unknown>;
      customerVarExisted = true;
    }
  } else {
    console.log(
      `Finding connection '${parsed.connectionKey}' in component '${parsed.componentKey}'...`,
    );
    const { connection, error } = findConnection(parsed.componentKey, parsed.connectionKey);

    if (error || !connection) {
      console.log(`Error: ${error}`);
      return 3;
    }

    console.log(`Found connection: ${connection.label}`);

    console.log("Creating scoped config variable...");
    const createResult = createScopedConfigVariable(
      connection,
      parsed.name,
      stableKey,
      parsed.strategy,
    );

    if (createResult.error || !createResult.result) {
      console.log(`Error creating scoped config variable: ${createResult.error}`);
      return 3;
    }

    scopedConfigVar = createResult.result;
    console.log(`Created scoped config variable: ${scopedConfigVar.id}`);
  }

  // Create test customer config variable if not skipped and doesn't exist
  if (!parsed.skipTestConnection && !customerVarExisted && scopedConfigVar) {
    const fieldValues: Record<string, string> = parsed.credentials ?? {};

    if (Object.keys(fieldValues).length === 0) {
      console.log("No credentials provided — skipping test customer config variable.");
      console.log("Customers will provide their own credentials during instance configuration.");
    } else {
      console.log("Creating test customer config variable...");
      const { result, error } = createCustomerConfigVariable(
        scopedConfigVar.id as string,
        fieldValues,
      );

      if (error || !result) {
        console.log(`Error creating customer config variable: ${error}`);
        return 3;
      }

      customerConfigVar = result;
      console.log(`Created test customer config variable: ${customerConfigVar.id}`);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("  CONNECTION CREATED");
  console.log("=".repeat(60));
  console.log("");

  const output: Record<string, unknown> = {
    stable_key: stableKey,
    name: parsed.name,
    scoped_config_variable_id: scopedConfigVar?.id,
    scoped_var_already_existed: scopedVarExisted,
  };

  if (customerConfigVar) {
    output.customer_config_variable_id = customerConfigVar.id;
    output.is_test = true;
    output.customer_var_already_existed = customerVarExisted;
  }

  console.log(JSON.stringify(output, null, 2));
  console.log("");
  console.log("Use this stable_key in your CNI integration:");
  if (parsed.strategy === "customer-activated") {
    console.log(`  customerActivatedConnection({ stableKey: "${stableKey}" })  // in configPages`);
  } else {
    console.log(
      `  organizationActivatedConnection({ stableKey: "${stableKey}" })  // in scopedConfigVars`,
    );
  }

  if (!customerConfigVar) {
    console.log(
      `\n<action-required blocking="true" type="test-credentials">\n` +
        `  Connection created but no test credentials configured.\n` +
        `  You MUST ask the user before proceeding. Do NOT skip this step.\n` +
        `  <ask-user>\n` +
        `    "Want to provide test credentials now so we can verify the connection works\n` +
        `    during development? Or skip — customers will provide their own during instance setup."\n` +
        `  </ask-user>\n` +
        `  <on-yes>\n` +
        `    Collect the required credential values from the user, then re-run this command\n` +
        `    with the credential values to create a test customer config variable.\n` +
        `  </on-yes>\n` +
        `  <on-no>\n` +
        `    Record the connection and continue. Testing will require real customer credentials later.\n` +
        `  </on-no>\n` +
        `</action-required>`,
    );
  }

  return 0;
}

process.exit(main());
