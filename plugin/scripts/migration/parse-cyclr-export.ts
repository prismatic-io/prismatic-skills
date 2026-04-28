#!/usr/bin/env npx tsx
/**
 * parse-cyclr-export.ts
 *
 * Deterministic JSON parser for Cyclr cycle export files.
 * Extracts structured data from Cyclr JSON export(s) and outputs JSON to stdout.
 *
 * Usage:
 *     npx tsx parse-cyclr-export.ts <export-path> [--summary]
 *
 * Input: Path to a single Cyclr JSON file or a directory containing .json files
 * Output: JSON to stdout with structured cycle data
 *
 * Flags:
 *     --summary   Output a condensed overview instead of full data.
 *                 Includes cycle counts, step names, connector names,
 *                 and field mapping counts. Useful for getting a quick
 *                 scope assessment before reading full output.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// ── Type definitions ──────────────────────────────────────────────────────────

interface CyclrField {
  Id: number | string;
  ConnectorField?: string;
}

interface CyclrParameter {
  Id: number | string;
  TargetType?: number;
  TargetName?: string;
}

interface CyclrMethod {
  RequestFormat?: { Fields?: CyclrField[] };
  ResponseFormat?: { Fields?: CyclrField[] };
  Parameters?: CyclrParameter[];
}

interface CyclrConnectorAuth {
  AuthType?: number;
  OAuth2Type?: number;
  AuthoriseUrl?: string;
  AccessTokenUrl?: string;
}

interface CyclrConnector {
  Name?: string;
  Version?: string;
  ReleaseVersionMajor?: number;
  ReleaseVersionMinor?: number;
  Parameters?: CyclrParameter[];
}

interface CyclrAccountConnector {
  Name?: string;
  Connector?: CyclrConnector;
  ConnectorAuthentication?: CyclrConnectorAuth;
}

interface CyclrFieldMapping {
  // Standard format
  Field?: { ConnectorField?: string };
  Value?: string;
  // Alternate format (some exports use these instead)
  SourceFieldConnectorField?: string;
  TargetFieldConnectorField?: string;
  CycleEntityMappingType?: number;
  IsLaunchVisible?: boolean;
}

interface CyclrCycleParameter {
  ParameterId?: number | string;
  Value?: string;
  CycleEntityMappingType?: number;
  IsLaunchVisible?: boolean;
}

interface CyclrStep {
  Id: string;
  Name?: string;
  Description?: string;
  ActionType?: number;
  Method_Id?: string;
  ContinueOnNullSource?: boolean;
  ContinueOnNullResult?: boolean;
  StepCollectionSplitType?: number;
  ActionData?: string;
  Interval?: number;
  AccountConnector?: CyclrAccountConnector;
  AccountConnector_Id?: number | string;
  Method?: CyclrMethod;
  CycleFieldMappings?: CyclrFieldMapping[];
  CycleParameters?: CyclrCycleParameter[];
}

interface CyclrEdge {
  TailStep_Id?: string;
  HeadStep_Id?: string;
  CycleEdgeType?: number;
}

interface CyclrVariable {
  Id?: string;
  Name?: string;
  Value?: string;
}

interface CyclrExport {
  Name?: string;
  Status?: number;
  VersionedCycle?: { Published?: boolean; Tags?: string[] };
  Shareable?: boolean;
  ShareFields?: unknown[];
  ShareAllFields?: boolean;
  RunOnce?: boolean;
  LaunchRunOnce?: boolean;
  CycleStepErrorAction?: number;
  MaxRetriesOnError?: number;
  CycleCollectionSplitType?: number;
  LogStepDataRequests?: boolean;
  Steps?: CyclrStep[];
  Edges?: CyclrEdge[];
  Variables?: CyclrVariable[];
  CustomMethodReleases?: unknown[];
}

// ── Output types ──────────────────────────────────────────────────────────────

interface ParsedRequestField {
  id: number | string;
  connector_field: string;
}

interface ParsedMethodParameter {
  id: number | string;
  target_type: string;
  target_name: string;
}

interface ParsedFieldMapping {
  target_field: string;
  value: string;
  mapping_type?: number;
  is_launch_visible: boolean;
}

interface ParsedParameter {
  parameter_id?: number | string;
  value: string;
  mapping_type?: number;
  is_launch_visible: boolean;
}

interface ParsedAccountConnector {
  name: string;
  connector_id?: number | string;
  connector_name?: string;
  version?: string;
  auth_type?: string;
  oauth2_type?: string;
  authorize_url?: string;
  token_url?: string;
}

interface ParsedStep {
  id: string;
  name: string;
  description: string;
  action_type?: number;
  method_id: string;
  continue_on_null_source?: boolean;
  continue_on_null_result?: boolean;
  step_collection_split_type?: number;
  action_data: string;
  interval?: number;
  account_connector?: ParsedAccountConnector;
  request_fields?: ParsedRequestField[];
  response_fields?: ParsedRequestField[];
  method_parameters?: ParsedMethodParameter[];
  field_mappings?: ParsedFieldMapping[];
  parameters?: ParsedParameter[];
}

interface ParsedEdge {
  tail_step_id: string;
  head_step_id: string;
  edge_type?: number;
}

interface ExecutionOrderEntry {
  step_id: string;
  step_name: string;
}

interface ParsedVariable {
  id: string;
  name: string;
  value: string;
}

interface CycleMetadata {
  name: string;
  status?: number;
  published: boolean;
  tags: string[];
  shareable: boolean;
  share_fields: unknown[];
  share_all_fields: boolean;
  run_once: boolean;
  launch_run_once: boolean;
  error_action?: number;
  max_retries?: number;
  cycle_collection_split_type?: number;
  log_step_data_requests: boolean;
}

interface ParsedCycle {
  name: string;
  published: boolean;
  status?: number;
  metadata: CycleMetadata;
  steps: ParsedStep[];
  edges: ParsedEdge[];
  execution_order: ExecutionOrderEntry[];
  variables: ParsedVariable[];
  custom_method_releases: unknown[];
}

interface ConnectorInfo {
  name: string;
  connector_id?: number | string;
  version?: string;
  release_version_major?: number;
  release_version_minor?: number;
  parameters?: ParsedMethodParameter[];
  auth_type?: string;
  oauth2_type?: string;
  authorize_url?: string;
  token_url?: string;
}

interface ResolvedReference {
  resolved: boolean;
  source_step_id?: string;
  source_step_name?: string;
  source_field?: string;
  source_field_id?: string;
}

interface DataFlowFieldMapping extends ResolvedReference {
  target_field: string;
  source_reference: string;
  mapping_type?: number;
}

interface DataFlowParameterMapping extends ResolvedReference {
  parameter_id?: number | string;
  source_reference: string;
  mapping_type?: number;
  is_launch_visible: boolean;
}

interface DataFlowEntry {
  step_id: string;
  step_name: string;
  field_mappings: DataFlowFieldMapping[];
  parameter_mappings: DataFlowParameterMapping[];
}

interface SummaryStats {
  total_cycles: number;
  total_steps: number;
  total_connectors: number;
  total_edges: number;
  total_variables: number;
  total_field_mappings: number;
  total_parameter_mappings: number;
}

interface ParsedOutput {
  platform: string;
  source_path: string;
  cycles: Record<string, ParsedCycle>;
  connectors: Record<string, ConnectorInfo>;
  data_flow: DataFlowEntry[];
  summary: SummaryStats;
}

interface SummaryCycleOverview {
  published?: boolean;
  status?: number;
  step_count: number;
  step_names: string[];
  edge_count: number;
  connectors_used: string[];
  variable_count: number;
  execution_order: string[];
}

interface SummaryConnectorOverview {
  version: string;
  auth_type: string;
  oauth2_type?: string;
}

interface DataFlowSummaryEntry {
  step_name: string;
  field_mapping_count: number;
  parameter_mapping_count: number;
}

interface SummaryOutput {
  platform: string;
  source_path: string;
  counts: SummaryStats;
  cycles: Record<string, SummaryCycleOverview>;
  connectors: Record<string, SummaryConnectorOverview>;
  data_flow_overview?: DataFlowSummaryEntry[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AUTH_TYPE_MAP: Record<number, string> = {
  1: "apiKey",
  2: "basic",
  3: "custom",
  4: "oauth2",
  5: "oauth1",
};

const OAUTH2_TYPE_MAP: Record<number, string> = {
  1: "AuthorizationCode",
  2: "ClientCredentials",
};

const PARAMETER_TARGET_TYPE_MAP: Record<number, string> = {
  1: "endpoint_url",
  2: "query_string",
  3: "header",
  4: "response_field",
  5: "boolean_setting",
};

// ── Core functions ────────────────────────────────────────────────────────────

function extractSteps(data: CyclrExport): ParsedStep[] {
  const steps: ParsedStep[] = [];

  for (const step of data.Steps ?? []) {
    const stepData: ParsedStep = {
      id: step.Id ?? "",
      name: step.Name ?? "",
      description: step.Description ?? "",
      action_type: step.ActionType,
      method_id: step.Method_Id ?? "",
      continue_on_null_source: step.ContinueOnNullSource,
      continue_on_null_result: step.ContinueOnNullResult,
      step_collection_split_type: step.StepCollectionSplitType,
      action_data: step.ActionData ?? "{}",
    };

    // Interval (polling steps)
    if (step.Interval !== undefined) {
      stepData.interval = step.Interval;
    }

    // Account connector info
    const ac = step.AccountConnector;
    if (ac) {
      stepData.account_connector = {
        name: ac.Name ?? "",
        connector_id: step.AccountConnector_Id,
      };

      const connector = ac.Connector;
      if (connector) {
        stepData.account_connector.connector_name = connector.Name ?? "";
        stepData.account_connector.version = connector.Version ?? "";
      }

      const auth = ac.ConnectorAuthentication;
      if (auth) {
        stepData.account_connector.auth_type = AUTH_TYPE_MAP[auth.AuthType as number] ?? "unknown";
        if (auth.OAuth2Type) {
          stepData.account_connector.oauth2_type = OAUTH2_TYPE_MAP[auth.OAuth2Type] ?? "unknown";
        }
        if (auth.AuthoriseUrl) {
          stepData.account_connector.authorize_url = auth.AuthoriseUrl;
        }
        if (auth.AccessTokenUrl) {
          stepData.account_connector.token_url = auth.AccessTokenUrl;
        }
      }
    }

    // Method request/response format fields
    const method = step.Method;
    if (method) {
      const reqFormat = method.RequestFormat;
      if (reqFormat?.Fields) {
        stepData.request_fields = reqFormat.Fields.map((f) => ({
          id: f.Id,
          connector_field: f.ConnectorField ?? "",
        }));
      }

      const respFormat = method.ResponseFormat;
      if (respFormat?.Fields) {
        stepData.response_fields = respFormat.Fields.map((f) => ({
          id: f.Id,
          connector_field: f.ConnectorField ?? "",
        }));
      }

      // Method-level parameters
      if (method.Parameters) {
        stepData.method_parameters = method.Parameters.map((p) => ({
          id: p.Id,
          target_type: PARAMETER_TARGET_TYPE_MAP[p.TargetType as number] ?? "unknown",
          target_name: p.TargetName ?? "",
        }));
      }
    }

    // CycleFieldMappings — handle both standard (Field/Value) and alternate (SourceFieldConnectorField/TargetFieldConnectorField) formats
    const cfm = step.CycleFieldMappings;
    if (cfm && cfm.length > 0) {
      stepData.field_mappings = cfm.map((m) => ({
        target_field: m.TargetFieldConnectorField ?? m.Field?.ConnectorField ?? "",
        value: m.SourceFieldConnectorField ?? m.Value ?? "",
        mapping_type: m.CycleEntityMappingType,
        is_launch_visible: m.IsLaunchVisible ?? false,
      }));
    }

    // CycleParameters
    const cp = step.CycleParameters;
    if (cp && cp.length > 0) {
      stepData.parameters = cp.map((p) => ({
        parameter_id: p.ParameterId,
        value: p.Value ?? "",
        mapping_type: p.CycleEntityMappingType,
        is_launch_visible: p.IsLaunchVisible ?? false,
      }));
    }

    steps.push(stepData);
  }

  return steps;
}

function extractConnectors(data: CyclrExport): Record<string, ConnectorInfo> {
  const connectorMap: Record<string, ConnectorInfo> = {};

  for (const step of data.Steps ?? []) {
    const ac = step.AccountConnector;
    if (!ac) continue;

    const name = ac.Name ?? "";
    if (!name || name in connectorMap) continue;

    const connectorInfo: ConnectorInfo = {
      name,
      connector_id: step.AccountConnector_Id,
    };

    const connector = ac.Connector;
    if (connector) {
      connectorInfo.version = connector.Version ?? "";
      connectorInfo.release_version_major = connector.ReleaseVersionMajor;
      connectorInfo.release_version_minor = connector.ReleaseVersionMinor;

      // Connector parameters
      if (connector.Parameters) {
        connectorInfo.parameters = connector.Parameters.map((p) => ({
          id: p.Id,
          target_type: PARAMETER_TARGET_TYPE_MAP[p.TargetType as number] ?? "unknown",
          target_name: p.TargetName ?? "",
        }));
      }
    }

    const auth = ac.ConnectorAuthentication;
    if (auth) {
      connectorInfo.auth_type = AUTH_TYPE_MAP[auth.AuthType as number] ?? "unknown";
      if (auth.OAuth2Type) {
        connectorInfo.oauth2_type = OAUTH2_TYPE_MAP[auth.OAuth2Type] ?? "unknown";
      }
      if (auth.AuthoriseUrl) {
        connectorInfo.authorize_url = auth.AuthoriseUrl;
      }
      if (auth.AccessTokenUrl) {
        connectorInfo.token_url = auth.AccessTokenUrl;
      }
    }

    connectorMap[name] = connectorInfo;
  }

  return connectorMap;
}

function buildExecutionOrder(data: CyclrExport): ExecutionOrderEntry[] {
  const edges = data.Edges ?? [];
  const steps = data.Steps ?? [];

  // Build step ID to name mapping
  const stepIds: Record<string, string> = {};
  for (const s of steps) {
    stepIds[s.Id] = s.Name ?? s.Id;
  }
  const allStepIds = new Set(Object.keys(stepIds));

  // Build adjacency list and in-degree count
  const graph: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const stepId of allStepIds) {
    inDegree[stepId] = 0;
  }

  for (const edge of edges) {
    const tail = edge.TailStep_Id ?? ""; // predecessor
    const head = edge.HeadStep_Id ?? ""; // successor
    if (tail && head) {
      if (!graph[tail]) graph[tail] = [];
      graph[tail].push(head);
      inDegree[head] = (inDegree[head] ?? 0) + 1;
    }
  }

  // Kahn's algorithm for topological sort
  // Start with nodes that have no incoming edges
  const queue: string[] = [...allStepIds].filter((sid) => (inDegree[sid] ?? 0) === 0).sort();

  const order: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift() as string;
    order.push(node);
    for (const neighbor of (graph[node] ?? []).slice().sort()) {
      inDegree[neighbor] -= 1;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles — if not all nodes were visited, the graph has cycles
  if (order.length < Object.keys(stepIds).length) {
    const missing = Object.keys(stepIds).filter((id) => !order.includes(id));
    process.stderr.write(
      `Warning: Cyclic dependency detected — ${missing.length} step(s) excluded from execution order: ${missing.map((id) => stepIds[id] ?? id).join(", ")}\n`,
    );
  }

  // Return ordered list with step names
  return order.map((sid) => ({
    step_id: sid,
    step_name: stepIds[sid] ?? sid,
  }));
}

function resolveReference(
  value: string,
  fieldLookup: Record<string, Record<string, string>>,
  stepNames: Record<string, string>,
): ResolvedReference {
  if (!value?.includes(",")) {
    return { resolved: false };
  }

  const commaIdx = value.indexOf(",");
  const sourceStepId = value.substring(0, commaIdx);
  const fieldId = value.substring(commaIdx + 1);

  const sourceStepName = stepNames[sourceStepId];
  if (sourceStepName === undefined) {
    return { resolved: false };
  }

  const sourceField = fieldLookup[sourceStepId]?.[fieldId] ?? "";
  const result: ResolvedReference = {
    resolved: true,
    source_step_id: sourceStepId,
    source_step_name: sourceStepName,
  };

  if (sourceField) {
    result.source_field = sourceField;
  } else {
    result.source_field_id = fieldId;
  }

  return result;
}

function resolveDataFlow(data: CyclrExport): DataFlowEntry[] {
  const steps = data.Steps ?? [];

  // Build a lookup: step_id -> {field_id -> ConnectorField name}
  // Handles both formats: ResponseFormat.Fields (numeric Id) and Method.Fields.Response (SystemField)
  const fieldLookup: Record<string, Record<string, string>> = {};
  for (const step of steps) {
    const stepId = step.Id ?? "";
    const fieldMap: Record<string, string> = {};

    // Standard format: Method.ResponseFormat.Fields with numeric Id
    const respFields = step.Method?.ResponseFormat?.Fields ?? [];
    for (const f of respFields) {
      fieldMap[String(f.Id)] = f.ConnectorField ?? "";
    }

    // Alternate format: Method.Fields.Response with SystemField as key
    const altResp = (step.Method as Record<string, unknown>)?.Fields as
      | Record<string, unknown[]>
      | undefined;
    if (altResp?.Response) {
      for (const f of altResp.Response as Array<Record<string, unknown>>) {
        const systemField = (f.SystemField as string) ?? "";
        const connField = (f.ConnectorField as string) ?? "";
        if (systemField) {
          fieldMap[systemField] = connField || systemField;
        }
      }
    }

    fieldLookup[stepId] = fieldMap;
  }

  // Also build step name lookup
  const stepNames: Record<string, string> = {};
  for (const s of steps) {
    stepNames[s.Id] = s.Name ?? s.Id;
  }

  const dataFlow: DataFlowEntry[] = [];

  for (const step of steps) {
    const stepId = step.Id ?? "";
    const stepEntry: DataFlowEntry = {
      step_id: stepId,
      step_name: step.Name ?? "",
      field_mappings: [],
      parameter_mappings: [],
    };

    // Resolve field mappings — handle both standard and alternate formats
    for (const mapping of step.CycleFieldMappings ?? []) {
      const targetField = mapping.TargetFieldConnectorField ?? mapping.Field?.ConnectorField ?? "";
      const value = mapping.SourceFieldConnectorField ?? mapping.Value ?? "";
      const resolved = resolveReference(value, fieldLookup, stepNames);
      stepEntry.field_mappings.push({
        target_field: targetField,
        source_reference: value,
        mapping_type: mapping.CycleEntityMappingType,
        ...resolved,
      });
    }

    // Resolve parameter mappings
    for (const param of step.CycleParameters ?? []) {
      const value = param.Value ?? "";
      const resolved = resolveReference(value, fieldLookup, stepNames);
      stepEntry.parameter_mappings.push({
        parameter_id: param.ParameterId,
        source_reference: value,
        mapping_type: param.CycleEntityMappingType,
        is_launch_visible: param.IsLaunchVisible ?? false,
        ...resolved,
      });
    }

    if (stepEntry.field_mappings.length > 0 || stepEntry.parameter_mappings.length > 0) {
      dataFlow.push(stepEntry);
    }
  }

  return dataFlow;
}

function extractVariables(data: CyclrExport): ParsedVariable[] {
  return (data.Variables ?? []).map((v) => ({
    id: v.Id ?? "",
    name: v.Name ?? "",
    value: v.Value ?? "",
  }));
}

function extractCycleMetadata(data: CyclrExport): CycleMetadata {
  return {
    name: data.Name ?? "",
    status: data.Status,
    published: data.VersionedCycle?.Published ?? false,
    tags: data.VersionedCycle?.Tags ?? [],
    shareable: data.Shareable ?? false,
    share_fields: data.ShareFields ?? [],
    share_all_fields: data.ShareAllFields ?? false,
    run_once: data.RunOnce ?? false,
    launch_run_once: data.LaunchRunOnce ?? false,
    error_action: data.CycleStepErrorAction,
    max_retries: data.MaxRetriesOnError,
    cycle_collection_split_type: data.CycleCollectionSplitType,
    log_step_data_requests: data.LogStepDataRequests ?? false,
  };
}

function extractCustomMethodReleases(data: CyclrExport): unknown[] {
  return data.CustomMethodReleases ?? [];
}

function parseCyclrFile(filepath: string): ParsedCycle | null {
  let data: CyclrExport;
  try {
    const raw = readFileSync(filepath, "utf-8");
    data = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`Warning: Failed to parse ${filepath}: ${e}\n`);
    return null;
  }

  // Validate this looks like a Cyclr export
  if (!data.Steps && !data.VersionedCycle) {
    process.stderr.write(
      `Warning: ${filepath} does not appear to be a Cyclr export (missing Steps/VersionedCycle)\n`,
    );
    return null;
  }

  const name =
    data.Name ?? (basename(filepath).split("_").slice(0, -1).join("_") || basename(filepath));
  const metadata = extractCycleMetadata(data);
  const steps = extractSteps(data);
  const edges: ParsedEdge[] = (data.Edges ?? []).map((e) => ({
    tail_step_id: e.TailStep_Id ?? "",
    head_step_id: e.HeadStep_Id ?? "",
    edge_type: e.CycleEdgeType,
  }));
  const executionOrder = buildExecutionOrder(data);
  const variables = extractVariables(data);
  const customMethodReleases = extractCustomMethodReleases(data);

  return {
    name,
    published: metadata.published,
    status: metadata.status,
    metadata,
    steps,
    edges,
    execution_order: executionOrder,
    variables,
    custom_method_releases: customMethodReleases,
  };
}

function parseCyclrExport(exportPath: string): ParsedOutput {
  const output: ParsedOutput = {
    platform: "cyclr",
    source_path: resolve(exportPath),
    cycles: {},
    connectors: {},
    data_flow: [],
    summary: {
      total_cycles: 0,
      total_steps: 0,
      total_connectors: 0,
      total_edges: 0,
      total_variables: 0,
      total_field_mappings: 0,
      total_parameter_mappings: 0,
    },
  };

  // Determine input files
  let jsonFiles: string[];
  const stat = statSync(exportPath);

  if (stat.isFile()) {
    jsonFiles = [exportPath];
  } else if (stat.isDirectory()) {
    jsonFiles = readdirSync(exportPath)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(exportPath, f));
  } else {
    process.stderr.write(`Error: ${exportPath} is not a file or directory\n`);
    process.exit(2);
  }

  if (jsonFiles.length === 0) {
    process.stderr.write(`Error: No JSON files found at ${exportPath}\n`);
    process.exit(2);
  }

  process.stderr.write(`Parsing ${jsonFiles.length} JSON file(s) from ${exportPath}\n`);

  const allConnectors: Record<string, ConnectorInfo> = {};
  const allDataFlow: DataFlowEntry[] = [];

  for (const filepath of jsonFiles) {
    let data: CyclrExport;
    try {
      const raw = readFileSync(filepath, "utf-8");
      data = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`Warning: Failed to read ${filepath}: ${e}\n`);
      continue;
    }

    if (!data.Steps && !data.VersionedCycle) {
      process.stderr.write(`Skipping ${filepath}: does not appear to be a Cyclr export\n`);
      continue;
    }

    const cycle = parseCyclrFile(filepath);
    if (cycle === null) continue;

    const cycleName = cycle.name;
    output.cycles[cycleName] = cycle;

    // Accumulate connectors across all cycles
    const fileConnectors = extractConnectors(data);
    for (const [cname, cdata] of Object.entries(fileConnectors)) {
      if (!(cname in allConnectors)) {
        allConnectors[cname] = cdata;
      }
    }

    // Accumulate data flow
    const fileDataFlow = resolveDataFlow(data);
    allDataFlow.push(...fileDataFlow);
  }

  output.connectors = allConnectors;
  output.data_flow = allDataFlow;

  // Summary stats
  const cycles = Object.values(output.cycles);
  const totalSteps = cycles.reduce((sum, c) => sum + c.steps.length, 0);
  const totalEdges = cycles.reduce((sum, c) => sum + c.edges.length, 0);
  const totalVariables = cycles.reduce((sum, c) => sum + c.variables.length, 0);
  const totalFieldMappings = output.data_flow.reduce(
    (sum, df) => sum + df.field_mappings.length,
    0,
  );
  const totalParameterMappings = output.data_flow.reduce(
    (sum, df) => sum + df.parameter_mappings.length,
    0,
  );

  output.summary = {
    total_cycles: Object.keys(output.cycles).length,
    total_steps: totalSteps,
    total_connectors: Object.keys(output.connectors).length,
    total_edges: totalEdges,
    total_variables: totalVariables,
    total_field_mappings: totalFieldMappings,
    total_parameter_mappings: totalParameterMappings,
  };

  return output;
}

function generateSummary(fullOutput: ParsedOutput): SummaryOutput {
  const summary: SummaryOutput = {
    platform: fullOutput.platform,
    source_path: fullOutput.source_path,
    counts: fullOutput.summary,
    cycles: {},
    connectors: {},
  };

  // Cycle overviews
  for (const [cname, cycle] of Object.entries(fullOutput.cycles ?? {})) {
    const stepNames = (cycle.steps ?? []).map((s) => s.name);
    const connectorNamesSet = new Set<string>();
    for (const s of cycle.steps ?? []) {
      const acName = s.account_connector?.name;
      if (acName) connectorNamesSet.add(acName);
    }

    summary.cycles[cname] = {
      published: cycle.published,
      status: cycle.status,
      step_count: (cycle.steps ?? []).length,
      step_names: stepNames,
      edge_count: (cycle.edges ?? []).length,
      connectors_used: [...connectorNamesSet],
      variable_count: (cycle.variables ?? []).length,
      execution_order: (cycle.execution_order ?? []).map((e) => e.step_name),
    };
  }

  // Connector overviews
  for (const [cname, cdata] of Object.entries(fullOutput.connectors ?? {})) {
    const connectorOverview: SummaryConnectorOverview = {
      version: cdata.version ?? "",
      auth_type: cdata.auth_type ?? "unknown",
    };
    if (cdata.oauth2_type) {
      connectorOverview.oauth2_type = cdata.oauth2_type;
    }
    summary.connectors[cname] = connectorOverview;
  }

  // Data flow summary
  const dataFlowSummary: DataFlowSummaryEntry[] = [];
  for (const df of fullOutput.data_flow ?? []) {
    dataFlowSummary.push({
      step_name: df.step_name,
      field_mapping_count: (df.field_mappings ?? []).length,
      parameter_mapping_count: (df.parameter_mappings ?? []).length,
    });
  }
  if (dataFlowSummary.length > 0) {
    summary.data_flow_overview = dataFlowSummary;
  }

  return summary;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  const summaryMode = argv.includes("--summary");
  const args = argv.filter((a) => !a.startsWith("--"));

  if (args.length !== 1) {
    process.stderr.write("Usage: npx tsx parse-cyclr-export.ts <export-path> [--summary]\n");
    process.stderr.write("\nInput: Path to a single Cyclr JSON file or directory of JSON files\n");
    process.exit(2);
  }

  const exportPath = args[0];

  if (!existsSync(exportPath)) {
    process.stderr.write(`Error: ${exportPath} does not exist\n`);
    process.exit(2);
  }

  const result = parseCyclrExport(exportPath);

  if (summaryMode) {
    const summary = generateSummary(result);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main();
