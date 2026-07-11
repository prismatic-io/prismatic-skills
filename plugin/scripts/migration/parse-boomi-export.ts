#!/usr/bin/env npx tsx
/**
 * parse-boomi-export.ts
 *
 * Deterministic XML parser for Boomi Component export directories.
 * Extracts structured data from all XML files in the export directory
 * and outputs JSON to stdout.
 *
 * Usage:
 *     npx tsx parse-boomi-export.ts <export-directory> [--summary]
 *
 * Input: Path to directory of Boomi Component XML files
 * Output: JSON to stdout with structured component data
 *
 * Flags:
 *     --summary   Output a condensed overview instead of full data.
 *                 Includes component counts, process names, system names,
 *                 connector types, and profile field counts. Useful for
 *                 getting a quick scope assessment before reading full output.
 *
 * NOTE: Requires `@xmldom/xmldom` — install with:
 *     npm install @xmldom/xmldom
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRequire } from "node:module";

// Resolve @xmldom/xmldom with zero global install: from local node_modules
// (createRequire since ESM has no bare `require`), else from the npx cache
// populated by `npx --package=<pkg> tsx <script>`.
function resolveNpxPackage(moduleName: string): unknown {
  try {
    return createRequire(import.meta.url)(moduleName);
  } catch {
    /* fall through to npx cache */
  }

  const npxBin = (process.env.PATH || "")
    .split(process.platform === "win32" ? ";" : ":")
    .find((p) => p.includes("_npx") && p.endsWith(".bin"));

  if (npxBin) {
    const nmPath = npxBin.replace(/[/\\]\.bin$/, "");
    try {
      return createRequire(join(nmPath, "_virtual.js"))(moduleName);
    } catch {
      /* fall through to error */
    }
  }

  throw new Error(
    `Cannot find ${moduleName}. Install it (\`npm install ${moduleName}\`) ` +
      `or run via: npx --package=${moduleName} tsx <script>`,
  );
}

import type { DOMParser as DOMParserType } from "@xmldom/xmldom";
const { DOMParser } = resolveNpxPackage("@xmldom/xmldom") as { DOMParser: typeof DOMParserType };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShapeConnection {
  to_shape: string;
  identifier?: string;
  text?: string;
}

interface ShapeConfig {
  action?: string;
  connection_id?: string;
  connector_type?: string;
  action_type?: string;
  process_id?: string;
  abort?: string;
  wait?: string;
  operation_id?: string;
  map_id?: string;
  name?: string;
  comparison?: string;
  num_branches?: string;
  catch_all?: string;
  retry_count?: string;
  steps?: DataProcessStep[];
  properties?: DocumentProperty[];
  doc_cache?: string;
  empty_cache_behavior?: string;
  load_all_doc?: string;
  remove_all_documents?: string;
  message?: string;
  level?: string;
  continue?: string;
  chunk_style?: string;
  chunks?: string;
}

interface DataProcessStep {
  name: string;
  process_type: string;
  type?: string;
  profile_type?: string;
  split_element?: string;
  profile_id?: string;
}

interface DocumentProperty {
  name: string;
  property_id: string;
  source_type?: string;
  source_component_id?: string;
  source_property_key?: string;
  source_property_label?: string;
  source_profile_id?: string;
  source_element_name?: string;
  crossref_table_id?: string;
  execution_property?: string;
  process_property?: string;
}

interface Shape {
  name: string;
  type: string;
  label: string;
  config: ShapeConfig;
  connections_to: ShapeConnection[];
}

interface ConnectionOverride {
  id: string;
  fields: { id: string; label: string; overrideable: boolean }[];
}

interface ProcessPropertyOverride {
  component_id: string;
  properties: { key: string; name: string; overrideable: boolean }[];
}

interface CrossRefOverride {
  id: string;
  name: string;
  overrideable: boolean;
}

interface ProcessData {
  name: string;
  shapes: Shape[];
  connection_overrides: ConnectionOverride[];
  process_property_overrides: ProcessPropertyOverride[];
  cross_reference_overrides?: CrossRefOverride[];
}

interface ConnectorSettings {
  name: string;
  sub_type: string;
  auth_type?: string;
  url?: string;
  connector_element?: string;
  [key: string]: unknown;
}

interface PathElement {
  name: string;
  is_variable: boolean;
}

interface RequestHeader {
  name: string;
  value: string;
  is_variable: boolean;
}

interface ConnectorAction {
  name: string;
  sub_type: string;
  method?: string;
  response_profile?: string;
  request_profile?: string;
  data_content_type?: string;
  path_elements?: PathElement[];
  request_headers?: RequestHeader[];
  operation_type?: string;
  connector_type?: string;
  custom_operation_type?: string;
  object_type_id?: string;
  object_type_name?: string;
  fields?: { id: string; type: string; value?: string }[];
  filters?: { field: string; operator: string }[];
  filter_operator?: string;
}

interface MappingEntry {
  type: string;
  from_path?: string;
  to_path?: string;
  from_function?: string;
  to_function?: string;
  from_type?: string;
  to_type?: string;
}

interface FunctionInput {
  key: string;
  name: string;
  default?: string;
}

interface FunctionOutput {
  key: string;
  name: string;
}

interface CrossRefInput {
  name: string;
  ref_id: string;
}

interface CrossRefOutput {
  name: string;
  ref_id: string;
}

interface MapFunction {
  key: string;
  type: string;
  name: string;
  category: string;
  inputs?: FunctionInput[];
  outputs?: FunctionOutput[];
  cross_ref_table_id?: string;
  cross_ref_inputs?: CrossRefInput[];
  cross_ref_outputs?: CrossRefOutput[];
  language?: string;
  script?: string;
  delimiter?: string;
  process_property_component_id?: string;
  process_property_name?: string;
  process_property_key?: string;
}

interface TransformMap {
  name: string;
  from_profile: string;
  to_profile: string;
  mappings: MappingEntry[];
  functions: MapFunction[];
}

interface Profile {
  name: string;
  type: string;
  fields: string[];
}

interface CrossReference {
  name: string;
  columns: string[];
}

interface ProcessPropertyEntry {
  key: string;
  label: string;
  type: string;
  help_text?: string;
  default_value?: string;
}

interface ProcessProperties {
  name: string;
  properties: ProcessPropertyEntry[];
}

interface ScriptData {
  name: string;
  type: string;
  script_type?: string;
  script?: string;
  language?: string;
  inputs?: { name: string; index: string }[];
  outputs?: { name: string; index: string }[];
  steps?: TransformFunctionStep[];
  [key: string]: unknown;
}

interface TransformFunctionStep {
  key: string;
  type: string;
  name: string;
  language?: string;
  use_component?: boolean;
  script_component_id?: string;
  script?: string;
  cross_ref_table_id?: string;
  doc_cache_id?: string;
  cache_index?: string;
  lookup_inputs?: { index: string; key_id: string; name: string }[];
  lookup_outputs?: { index: string; key: string; name: string }[];
  delimiter?: string;
}

interface CacheIndex {
  index_id: string;
  index_name: string;
  keys?: { alias: string; element_key: string }[];
}

interface DocumentCache {
  name: string;
  max_documents?: string;
  expiration?: string;
  profile?: string;
  profile_type?: string;
  enforce_single_lucene?: string;
  indexes?: CacheIndex[];
}

interface ComponentEntry {
  name: string;
  type: string;
  sub_type: string;
  file: string;
}

interface OutputSummary {
  total_files: number;
  total_components: number;
  processes: number;
  connector_settings: number;
  connector_actions: number;
  transform_maps: number;
  profiles: number;
  cross_references: number;
  process_properties: number;
  scripts: number;
  document_caches: number;
}

interface FullOutput {
  platform: "boomi";
  source_directory: string;
  components: Record<string, ComponentEntry>;
  processes: Record<string, ProcessData>;
  connector_settings: Record<string, ConnectorSettings>;
  connector_actions: Record<string, ConnectorAction>;
  transform_maps: Record<string, TransformMap>;
  profiles: Record<string, Profile>;
  cross_references: Record<string, CrossReference>;
  process_properties: Record<string, ProcessProperties>;
  scripts: Record<string, ScriptData>;
  document_caches: Record<string, DocumentCache>;
  summary: OutputSummary;
}

interface SummaryOutput {
  platform: string;
  source_directory: string;
  counts: OutputSummary;
  processes: Record<
    string,
    {
      name: string;
      shape_count: number;
      shape_types: Record<string, number>;
      is_monitoring: boolean;
      has_connection_overrides: boolean;
      has_property_overrides: boolean;
    }
  >;
  systems: {
    id: string;
    name: string;
    auth_type: string;
    url_pattern: string;
  }[];
  endpoints: {
    id: string;
    name: string;
    method: string;
    path: string;
    has_response_profile: boolean;
    has_request_profile: boolean;
  }[];
  profiles_overview: Record<
    string,
    {
      name: string;
      type: string;
      field_count: number;
    }
  >;
  transform_maps_overview: {
    id: string;
    name: string;
    mapping_count: number;
    function_count: number;
    function_types: string[];
  }[];
  config_sources: {
    id: string;
    name: string;
    property_count: number;
    property_names: string[];
  }[];
  scripts_overview: {
    id: string;
    name: string;
    type: string;
    step_count?: number;
  }[];
  document_caches_overview: {
    id: string;
    name: string;
    index_names: string[];
  }[];
}

// ---------------------------------------------------------------------------
// XML DOM helpers
// ---------------------------------------------------------------------------

/**
 * The Boomi XML namespace prefix. All Boomi elements use the `bns:` prefix
 * with namespace `http://api.platform.boomi.com/`.
 */
const BNS = "bns:";

/**
 * Get an attribute value from an Element, returning fallback if absent.
 * Handles both namespace-prefixed and unprefixed attributes.
 */
function getAttr(elem: Element, name: string, fallback = ""): string {
  // Boomi XML attributes are not namespace-prefixed
  const val = elem.getAttribute(name);
  if (val === null || val === undefined) return fallback;
  return val;
}

/**
 * Get the first direct child element matching a local tag name.
 * Tries both prefixed (bns:tag) and unprefixed (tag) to handle
 * elements inside and outside the namespace.
 */
function getChild(parent: Element, localName: string): Element | null {
  // Try bns:-prefixed first, then unprefixed
  for (const tagName of [`${BNS}${localName}`, localName]) {
    const children = parent.getElementsByTagName(tagName);
    // Return the first one that is a direct child
    for (let i = 0; i < children.length; i++) {
      if (children[i].parentNode === parent) {
        return children[i];
      }
    }
  }
  return null;
}

/**
 * Get all direct child elements matching a local tag name.
 * Returns an array of Elements.
 */
function getChildArray(parent: Element, localName: string): Element[] {
  const result: Element[] = [];
  for (const tagName of [`${BNS}${localName}`, localName]) {
    const children = parent.getElementsByTagName(tagName);
    for (let i = 0; i < children.length; i++) {
      if (children[i].parentNode === parent) {
        result.push(children[i]);
      }
    }
  }
  return result;
}

/**
 * Get the trimmed text of the first direct child element matching tag.
 * Uses firstChild.nodeValue (direct text node) to match Python's .text behavior,
 * NOT textContent (which includes all descendant text).
 */
function getChildText(parent: Element, localName: string, fallback = ""): string {
  const child = getChild(parent, localName);
  if (!child) return fallback;
  // Use firstChild.nodeValue for direct text (like Python ElementTree .text)
  // Fall back to textContent for elements with no direct text node
  const directText = child.firstChild?.nodeValue;
  const text = directText ?? child.textContent;
  if (text === null || text === undefined) return fallback;
  const trimmed = text.trim();
  return trimmed || fallback;
}

/**
 * Recursively find all descendant elements matching a local tag name.
 * Mirrors Python's `elem.iter(tag)`.
 */
function iterAllElements(root: Element, localName: string): Element[] {
  const results: Element[] = [];
  for (const tagName of [`${BNS}${localName}`, localName]) {
    const elems = root.getElementsByTagName(tagName);
    for (let i = 0; i < elems.length; i++) {
      results.push(elems[i]);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Component parsing
// ---------------------------------------------------------------------------

interface ParsedComponent {
  component_id: string;
  name: string;
  type: string;
  sub_type: string;
  file: string;
  root: Element;
}

function parseComponentFile(filepath: string): ParsedComponent | null {
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    console.error(`Warning: Failed to read ${filepath}`);
    return null;
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, "text/xml");
    // DOMParser doesn't throw on malformed XML — check for parse errors
    const parseErrors = doc.getElementsByTagName("parsererror");
    if (parseErrors.length > 0) {
      console.error(
        `Warning: XML parse error in ${filepath}: ${parseErrors[0]?.textContent ?? "unknown error"}`,
      );
      return null;
    }
  } catch (e) {
    console.error(`Warning: Failed to parse ${filepath}: ${e}`);
    return null;
  }

  // The root element is bns:Component
  const roots = doc.getElementsByTagName(`${BNS}Component`);
  if (roots.length === 0) {
    // Fallback: try without prefix
    const fallback = doc.getElementsByTagName("Component");
    if (fallback.length === 0) {
      console.error(`Warning: No Component root element in ${filepath}`);
      return null;
    }
    const root = fallback[0];
    return {
      component_id: getAttr(root, "componentId"),
      name: getAttr(root, "name"),
      type: getAttr(root, "type"),
      sub_type: getAttr(root, "subType"),
      file: basename(filepath),
      root,
    };
  }

  const root = roots[0];
  return {
    component_id: getAttr(root, "componentId"),
    name: getAttr(root, "name"),
    type: getAttr(root, "type"),
    sub_type: getAttr(root, "subType"),
    file: basename(filepath),
    root,
  };
}

// ---------------------------------------------------------------------------
// Shape connections
// ---------------------------------------------------------------------------

function extractShapeConnections(shapeElem: Element): ShapeConnection[] {
  const connections: ShapeConnection[] = [];
  const dragpointsElem = getChild(shapeElem, "dragpoints");
  if (!dragpointsElem) return connections;

  for (const dp of getChildArray(dragpointsElem, "dragpoint")) {
    const toShape = getAttr(dp, "toShape");
    const identifier = getAttr(dp, "identifier");
    const text = getAttr(dp, "text");
    if (toShape) {
      const conn: ShapeConnection = { to_shape: toShape };
      if (identifier) conn.identifier = identifier;
      if (text) conn.text = text;
      connections.push(conn);
    }
  }
  return connections;
}

// ---------------------------------------------------------------------------
// Shape configuration
// ---------------------------------------------------------------------------

function parseShapeConfig(shapeElem: Element, shapeType: string): ShapeConfig {
  const config: ShapeConfig = {};
  const configElem = getChild(shapeElem, "configuration");
  if (!configElem) return config;

  if (shapeType === "start") {
    if (getChild(configElem, "noaction") !== null) {
      config.action = "noaction";
    }
    const connaction = getChild(configElem, "connectoraction");
    if (connaction) {
      config.action = "connectoraction";
      config.connection_id = getAttr(connaction, "connectionId");
      config.connector_type = getAttr(connaction, "connectorType");
      config.action_type = getAttr(connaction, "actionType");
    }
  } else if (shapeType === "processcall") {
    const pc = getChild(configElem, "processcall");
    if (pc) {
      config.process_id = getAttr(pc, "processId");
      config.abort = getAttr(pc, "abort");
      config.wait = getAttr(pc, "wait");
    }
  } else if (shapeType === "connectoraction") {
    const ca = getChild(configElem, "connectoraction");
    if (ca) {
      config.connection_id = getAttr(ca, "connectionId");
      config.connector_type = getAttr(ca, "connectorType");
      config.action_type = getAttr(ca, "actionType");
      config.operation_id = getAttr(ca, "operationId");
    }
  } else if (shapeType === "map") {
    const m = getChild(configElem, "map");
    if (m) {
      config.map_id = getAttr(m, "mapId");
    }
  } else if (shapeType === "decision") {
    const d = getChild(configElem, "decision");
    if (d) {
      config.name = getAttr(d, "name");
      config.comparison = getAttr(d, "comparison");
    }
  } else if (shapeType === "branch") {
    const b = getChild(configElem, "branch");
    if (b) {
      config.num_branches = getAttr(b, "numBranches");
    }
  } else if (shapeType === "catcherrors") {
    const ce = getChild(configElem, "catcherrors");
    if (ce) {
      config.catch_all = getAttr(ce, "catchAll");
      config.retry_count = getAttr(ce, "retryCount");
    }
  } else if (shapeType === "dataprocess") {
    const dpElem = getChild(configElem, "dataprocess");
    if (dpElem) {
      const steps: DataProcessStep[] = [];
      for (const step of getChildArray(dpElem, "step")) {
        const stepInfo: DataProcessStep = {
          name: getAttr(step, "name"),
          process_type: getAttr(step, "processtype"),
        };
        const split = getChild(step, "documentsplit");
        if (split) {
          stepInfo.type = "split";
          stepInfo.profile_type = getAttr(split, "profileType");
          const splitOptions = getChild(split, "SplitOptions");
          const jsonOpts = splitOptions ? getChild(splitOptions, "JSONOptions") : null;
          if (jsonOpts) {
            stepInfo.split_element = getAttr(jsonOpts, "linkElementName");
            stepInfo.profile_id = getAttr(jsonOpts, "profileId");
          }
        }
        steps.push(stepInfo);
      }
      config.steps = steps;
    }
  } else if (shapeType === "documentproperties") {
    const dpElem = getChild(configElem, "documentproperties");
    if (dpElem) {
      const props: DocumentProperty[] = [];
      for (const prop of getChildArray(dpElem, "documentproperty")) {
        const propInfo: DocumentProperty = {
          name: getAttr(prop, "name"),
          property_id: getAttr(prop, "propertyId"),
        };
        const sourceValues = getChild(prop, "sourcevalues");
        if (sourceValues) {
          for (const sv of getChildArray(sourceValues, "parametervalue")) {
            const dpp = getChild(sv, "definedprocessparameter");
            if (dpp) {
              propInfo.source_type = "defined_process_property";
              propInfo.source_component_id = getAttr(dpp, "componentId");
              propInfo.source_property_key = getAttr(dpp, "propertyKey");
              propInfo.source_property_label = getAttr(dpp, "propertyLabel");
            }
            const profileElem = getChild(sv, "profileelement");
            if (profileElem) {
              propInfo.source_type = "profile";
              propInfo.source_profile_id = getAttr(profileElem, "profileId");
              propInfo.source_element_name = getAttr(profileElem, "elementName");
            }
            const crossref = getChild(sv, "crossrefparameter");
            if (crossref) {
              propInfo.source_type = "crossref";
              propInfo.crossref_table_id = getAttr(crossref, "crossRefTableId");
            }
            const execParam = getChild(sv, "executionparameter");
            if (execParam) {
              propInfo.source_type = "execution";
              propInfo.execution_property = getAttr(execParam, "executionproperty");
            }
            const processParam = getChild(sv, "processparameter");
            if (processParam) {
              propInfo.source_type = "process";
              propInfo.process_property = getAttr(processParam, "processproperty");
            }
          }
        }
        props.push(propInfo);
      }
      config.properties = props;
    }
  } else if (
    shapeType === "doccacheload" ||
    shapeType === "doccacheretrieve" ||
    shapeType === "doccacheremove"
  ) {
    for (const tag of ["doccacheload", "doccacheretrieve", "doccacheremove"] as const) {
      const elem = getChild(configElem, tag);
      if (elem) {
        config.doc_cache = getAttr(elem, "docCache");
        if (tag === "doccacheretrieve") {
          config.empty_cache_behavior = getAttr(elem, "emptyCacheBehavior");
          config.load_all_doc = getAttr(elem, "loadAllDoc");
        }
        if (tag === "doccacheremove") {
          config.remove_all_documents = getAttr(elem, "removeAllDocuments");
        }
        break;
      }
    }
  } else if (shapeType === "notify") {
    const n = getChild(configElem, "notify");
    if (n) {
      config.message = getChildText(n, "notifyMessage");
      config.level = getChildText(n, "notifyMessageLevel");
    }
  } else if (shapeType === "stop") {
    const s = getChild(configElem, "stop");
    if (s) {
      config.continue = getAttr(s, "continue");
    }
  } else if (shapeType === "flowcontrol") {
    const fc = getChild(configElem, "flowcontrol");
    if (fc) {
      config.chunk_style = getAttr(fc, "chunkStyle");
      config.chunks = getAttr(fc, "chunks");
    }
  } else if (shapeType !== "") {
    // Unknown shape type — log so it's not silently lost
    process.stderr.write(`Warning: Unknown shape type "${shapeType}" — config not extracted\n`);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Process parsing
// ---------------------------------------------------------------------------

function parseProcess(root: Element): Omit<ProcessData, "name"> | null {
  // Try <object><process>
  let processElem: Element | null = null;
  const objElem = getChild(root, "object");
  if (objElem) {
    processElem = getChild(objElem, "process");
  }
  if (!processElem) return null;

  const shapes: Shape[] = [];
  const shapesElem = getChild(processElem, "shapes");
  if (shapesElem) {
    for (const shape of getChildArray(shapesElem, "shape")) {
      shapes.push({
        name: getAttr(shape, "name"),
        type: getAttr(shape, "shapetype"),
        label: getAttr(shape, "userlabel"),
        config: parseShapeConfig(shape, getAttr(shape, "shapetype")),
        connections_to: extractShapeConnections(shape),
      });
    }
  }

  // Parse processOverrides
  const overridesRoot = getChild(root, "processOverrides");
  const connectionOverrides: ConnectionOverride[] = [];
  const processPropertyOverrides: ProcessPropertyOverride[] = [];
  let crossRefOverrides: CrossRefOverride[] = [];

  if (overridesRoot) {
    let overridesElem = getChild(overridesRoot, "Overrides");
    // If not found directly, scan direct children for an element ending with :Overrides
    if (!overridesElem) {
      const children = overridesRoot.childNodes;
      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.nodeType === 1) {
          // ELEMENT_NODE
          const el = node as Element;
          if (el.tagName === "Overrides" || el.tagName.endsWith(":Overrides")) {
            overridesElem = el;
            break;
          }
        }
      }
    }

    if (overridesElem) {
      // Connection overrides
      const connectionsElem = getChild(overridesElem, "Connections");
      if (connectionsElem) {
        for (const co of getChildArray(connectionsElem, "ConnectionOverride")) {
          const fields: ConnectionOverride["fields"] = [];
          for (const field of getChildArray(co, "field")) {
            fields.push({
              id: getAttr(field, "id"),
              label: getAttr(field, "label"),
              overrideable: getAttr(field, "overrideable") === "true",
            });
          }
          connectionOverrides.push({ id: getAttr(co, "id"), fields });
        }
      }

      // Process property overrides
      const dppOverrides = getChild(overridesElem, "DefinedProcessPropertyOverrides");
      if (dppOverrides) {
        for (const comp of getChildArray(
          dppOverrides,
          "OverrideableDefinedProcessPropertyComponent",
        )) {
          const props: ProcessPropertyOverride["properties"] = [];
          for (const val of getChildArray(comp, "OverrideableDefinedProcessPropertyValue")) {
            props.push({
              key: getAttr(val, "key"),
              name: getAttr(val, "name"),
              overrideable: getAttr(val, "overrideable") === "true",
            });
          }
          processPropertyOverrides.push({
            component_id: getAttr(comp, "componentId"),
            properties: props,
          });
        }
      }

      // Cross-reference overrides
      const xrefOverrides = getChild(overridesElem, "CrossReferenceOverrides");
      if (xrefOverrides) {
        crossRefOverrides = [];
        for (const xref of getChildArray(xrefOverrides, "CrossReferenceOverride")) {
          crossRefOverrides.push({
            id: getAttr(xref, "id"),
            name: getAttr(xref, "name"),
            overrideable: getAttr(xref, "overrideable") === "true",
          });
        }
      }
    }
  }

  const result: Omit<ProcessData, "name"> & { cross_reference_overrides?: CrossRefOverride[] } = {
    shapes,
    connection_overrides: connectionOverrides,
    process_property_overrides: processPropertyOverrides,
  };
  if (crossRefOverrides.length > 0) {
    result.cross_reference_overrides = crossRefOverrides;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Connector settings
// ---------------------------------------------------------------------------

function parseConnectorSettings(root: Element): Record<string, unknown> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const result: Record<string, unknown> = {};

  // HTTP connector
  const http = getChild(obj, "HttpSettings");
  if (http) {
    result.auth_type = getAttr(http, "authenticationType", "NONE");
    result.url = getAttr(http, "url");
    return result;
  }

  // Check for any other element (custom connectors)
  // Iterate direct child elements, skipping encryptedValues
  const children = obj.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType !== 1) continue; // ELEMENT_NODE only
    const el = node as Element;
    const localName = el.localName || el.tagName;
    if (localName === "encryptedValues") continue;

    result.connector_element = localName;
    // Extract attributes
    const attrs = el.attributes;
    for (let j = 0; j < attrs.length; j++) {
      const a = attrs[j];
      // Skip xmlns declarations
      if (a.name.startsWith("xmlns")) continue;
      result[a.name] = a.value;
    }
    break; // Only take the first non-encryptedValues child element
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transform map
// ---------------------------------------------------------------------------

function parseTransformMap(root: Element): Omit<TransformMap, "name"> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const mapElem = getChild(obj, "Map");
  if (!mapElem) return null;

  const fromProfile = getAttr(mapElem, "fromProfile");
  const toProfile = getAttr(mapElem, "toProfile");

  const mappings: MappingEntry[] = [];
  const mappingsElem = getChild(mapElem, "Mappings");
  if (mappingsElem) {
    for (const m of getChildArray(mappingsElem, "Mapping")) {
      const fromType = getAttr(m, "fromType");
      const toType = getAttr(m, "toType");
      const mapping: MappingEntry = { type: "other" };

      if (fromType === "profile" && toType === "profile") {
        mapping.from_path = getAttr(m, "fromNamePath");
        mapping.to_path = getAttr(m, "toNamePath");
        mapping.type = "direct";
      } else if (fromType === "profile" && toType === "function") {
        mapping.from_path = getAttr(m, "fromNamePath");
        mapping.to_function = getAttr(m, "toFunction");
        mapping.type = "to_function";
      } else if (fromType === "function" && toType === "profile") {
        mapping.from_function = getAttr(m, "fromFunction");
        mapping.to_path = getAttr(m, "toNamePath");
        mapping.type = "from_function";
      } else if (fromType === "function" && toType === "function") {
        mapping.from_function = getAttr(m, "fromFunction");
        mapping.to_function = getAttr(m, "toFunction");
        mapping.type = "function_to_function";
      } else {
        mapping.from_type = fromType;
        mapping.to_type = toType;
        mapping.from_path = getAttr(m, "fromNamePath");
        mapping.to_path = getAttr(m, "toNamePath");
      }

      mappings.push(mapping);
    }
  }

  const functions: MapFunction[] = [];
  const functionsElem = getChild(mapElem, "Functions");
  if (functionsElem) {
    for (const fs of getChildArray(functionsElem, "FunctionStep")) {
      const func: MapFunction = {
        key: getAttr(fs, "key"),
        type: getAttr(fs, "type"),
        name: getAttr(fs, "name"),
        category: getAttr(fs, "category"),
      };

      // Extract inputs
      const inputsElem = getChild(fs, "Inputs");
      if (inputsElem) {
        const inputs: FunctionInput[] = [];
        for (const inp of getChildArray(inputsElem, "Input")) {
          const inputData: FunctionInput = {
            key: getAttr(inp, "key"),
            name: getAttr(inp, "name"),
          };
          const defaultVal = getAttr(inp, "default");
          if (defaultVal) inputData.default = defaultVal;
          inputs.push(inputData);
        }
        func.inputs = inputs;
      }

      // Extract outputs
      const outputsElem = getChild(fs, "Outputs");
      if (outputsElem) {
        const outputs: FunctionOutput[] = [];
        for (const out of getChildArray(outputsElem, "Output")) {
          outputs.push({
            key: getAttr(out, "key"),
            name: getAttr(out, "name"),
          });
        }
        func.outputs = outputs;
      }

      // Extract configuration
      const configElem = getChild(fs, "Configuration");
      if (configElem) {
        // CrossRefLookup
        const xref = getChild(configElem, "CrossRefLookup");
        if (xref) {
          func.cross_ref_table_id = getAttr(xref, "crossRefTableId");
          const xrefInputs: CrossRefInput[] = [];
          for (const xi of getChildArray(xref, "Input")) {
            xrefInputs.push({
              name: getAttr(xi, "name"),
              ref_id: getAttr(xi, "refId"),
            });
          }
          func.cross_ref_inputs = xrefInputs;

          const xrefOutputs: CrossRefOutput[] = [];
          for (const xo of getChildArray(xref, "Output")) {
            xrefOutputs.push({
              name: getAttr(xo, "name"),
              ref_id: getAttr(xo, "refId"),
            });
          }
          func.cross_ref_outputs = xrefOutputs;
        }

        // Scripting
        const scripting = getChild(configElem, "Scripting");
        if (scripting) {
          func.language = getAttr(scripting, "language");
          const scriptText = getChildText(scripting, "ScriptToExecute");
          if (scriptText) func.script = scriptText;
        }

        // StringConcat
        const concat = getChild(configElem, "StringConcat");
        if (concat) {
          func.delimiter = getAttr(concat, "delimiter");
        }

        // DefinedProcessProperty
        const dpp = getChild(configElem, "DefinedProcessProperty");
        if (dpp) {
          func.process_property_component_id = getAttr(dpp, "componentId");
          func.process_property_name = getAttr(dpp, "propertyName");
          func.process_property_key = getAttr(dpp, "propertyKey");
        }
      }

      functions.push(func);
    }
  }

  return { from_profile: fromProfile, to_profile: toProfile, mappings, functions };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function parseProfile(root: Element, compType: string): Omit<Profile, "name"> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const fields: string[] = [];
  let profileType = "unknown";

  if (compType.includes("json")) {
    profileType = "json";
    for (const entry of iterAllElements(obj, "JSONObjectEntry")) {
      const name = getAttr(entry, "name");
      if (name) fields.push(name);
    }
  } else if (compType.includes("xml")) {
    profileType = "xml";
    for (const elem of iterAllElements(obj, "XMLElement")) {
      const name = getAttr(elem, "name");
      if (name) fields.push(name);
    }
  } else if (compType.includes("flatfile")) {
    profileType = "flatfile";
    // Iterate all descendant elements, collecting names except from DataFormat elements
    const collectFlatfileFields = (node: Element): void => {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType !== 1) continue; // ELEMENT_NODE only
        const el = child as Element;
        const localName = el.localName || el.tagName;
        // Strip bns: prefix for comparison
        const baseName = localName.startsWith("bns:") ? localName.slice(4) : localName;
        if (baseName === "DataFormat") continue;
        const name = getAttr(el, "name");
        if (name) fields.push(name);
        collectFlatfileFields(el);
      }
    };
    collectFlatfileFields(obj);
  }

  return { type: profileType, fields };
}

// ---------------------------------------------------------------------------
// Cross reference
// ---------------------------------------------------------------------------

function parseCrossReference(root: Element): Omit<CrossReference, "name"> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const columns: string[] = [];
  const xref = getChild(obj, "CrossRefTable");
  if (xref) {
    const headers = getChild(xref, "ColumnHeaders");
    if (headers) {
      for (const col of getChildArray(headers, "columnHeader")) {
        const text = (col.textContent || "").trim();
        if (text) columns.push(text);
      }
    }
  }

  return { columns };
}

// ---------------------------------------------------------------------------
// Process properties
// ---------------------------------------------------------------------------

function parseProcessProperties(root: Element): Omit<ProcessProperties, "name"> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const properties: ProcessPropertyEntry[] = [];
  const dpp = getChild(obj, "DefinedProcessProperties");
  if (dpp) {
    for (const prop of getChildArray(dpp, "definedProcessProperty")) {
      const key = getAttr(prop, "key");
      const label = getChildText(prop, "label");
      const propType = getChildText(prop, "type");
      const helpText = getChildText(prop, "helpText");
      const defaultVal = getChildText(prop, "defaultValue");

      const propData: ProcessPropertyEntry = { key, label, type: propType };
      if (helpText) propData.help_text = helpText;
      if (defaultVal) propData.default_value = defaultVal;
      properties.push(propData);
    }
  }

  return { properties };
}

// ---------------------------------------------------------------------------
// Connector action (operation)
// ---------------------------------------------------------------------------

function parseConnectorAction(root: Element): Record<string, unknown> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const operation = getChild(obj, "Operation");
  if (!operation) return null;

  const config = getChild(operation, "Configuration");
  if (!config) return {};

  const result: Record<string, unknown> = {};

  // HTTP actions
  const httpActionTypes = [
    "HttpGetAction",
    "HttpSendAction",
    "HttpPostAction",
    "HttpPutAction",
    "HttpDeleteAction",
    "HttpPatchAction",
  ] as const;

  for (const actionType of httpActionTypes) {
    const action = getChild(config, actionType);
    if (action) {
      const methodFallback = actionType.replace("Http", "").replace("Action", "").toUpperCase();
      result.method = getAttr(action, "methodType", methodFallback);
      result.response_profile = getAttr(action, "responseProfile");
      result.request_profile = getAttr(action, "requestProfile");
      result.data_content_type = getAttr(action, "dataContentType");

      // Path elements
      const pathElementsContainer = getChild(action, "pathElements");
      if (pathElementsContainer) {
        const pathElements: PathElement[] = [];
        for (const elem of getChildArray(pathElementsContainer, "element")) {
          pathElements.push({
            name: getAttr(elem, "name"),
            is_variable: getAttr(elem, "isVariable") === "true",
          });
        }
        if (pathElements.length > 0) result.path_elements = pathElements;
      }

      // Request headers
      const headersContainer = getChild(action, "requestHeaders");
      if (headersContainer) {
        const headers: RequestHeader[] = [];
        for (const header of getChildArray(headersContainer, "header")) {
          headers.push({
            name: getAttr(header, "headerName"),
            value: getAttr(header, "headerValue"),
            is_variable: getAttr(header, "isVariable") === "true",
          });
        }
        if (headers.length > 0) result.request_headers = headers;
      }
      break;
    }
  }

  // If no HTTP action found, check for GenericOperationConfig
  if (Object.keys(result).length === 0) {
    const generic = getChild(config, "GenericOperationConfig");
    if (generic) {
      result.operation_type = getAttr(generic, "operationType");
      result.connector_type = "custom";
      const customOp = getAttr(generic, "customOperationType");
      if (customOp) result.custom_operation_type = customOp;
      const objectTypeId = getAttr(generic, "objectTypeId");
      if (objectTypeId) result.object_type_id = objectTypeId;
      const objectTypeName = getAttr(generic, "objectTypeName");
      if (objectTypeName) result.object_type_name = objectTypeName;
      const respProfile = getAttr(generic, "responseProfile");
      if (respProfile) result.response_profile = respProfile;
      const reqProfile = getAttr(generic, "requestProfile");
      if (reqProfile) result.request_profile = reqProfile;

      // Config fields
      const fieldList: { id: string; type: string; value?: string }[] = [];
      for (const field of getChildArray(generic, "field")) {
        const fieldEntry: { id: string; type: string; value?: string } = {
          id: getAttr(field, "id"),
          type: getAttr(field, "type"),
        };
        const val = getAttr(field, "value");
        if (val) fieldEntry.value = val;
        fieldList.push(fieldEntry);
      }
      if (fieldList.length > 0) result.fields = fieldList;

      // Filters (flat list from ConnectorFilterExpression at any depth)
      const filters: { field: string; operator: string }[] = [];
      for (const expr of iterAllElements(generic, "ConnectorFilterExpression")) {
        filters.push({
          field: getAttr(expr, "expressionField"),
          operator: getAttr(expr, "expressionOperator"),
        });
      }
      if (filters.length > 0) result.filters = filters;

      const logicals = iterAllElements(generic, "ConnectorFilterLogical");
      if (logicals.length > 0) {
        result.filter_operator = getAttr(logicals[0], "logicalOperator");
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Scripting
// ---------------------------------------------------------------------------

function parseScripting(root: Element): Record<string, unknown> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const result: Record<string, unknown> = {};
  const scriptTags = [
    "MappingScript",
    "ProcessingScript",
    "ProcessScript",
    "MapScript",
    "Script",
  ] as const;

  for (const tag of scriptTags) {
    const scriptElem = getChild(obj, tag);
    if (scriptElem) {
      result.script_type = tag;
      // Try ScriptToExecute first, then 'script'
      let scriptText = getChildText(scriptElem, "ScriptToExecute");
      if (!scriptText) {
        scriptText = getChildText(scriptElem, "script");
      }
      if (scriptText) result.script = scriptText;
      result.language = getAttr(scriptElem, "language", "groovy2");

      // Extract inputs/outputs
      const inputs: { name: string; index: string }[] = [];
      for (const inp of getChildArray(scriptElem, "Input")) {
        inputs.push({ name: getAttr(inp, "name"), index: getAttr(inp, "index") });
      }
      if (inputs.length > 0) result.inputs = inputs;

      const outputs: { name: string; index: string }[] = [];
      for (const out of getChildArray(scriptElem, "Output")) {
        outputs.push({ name: getAttr(out, "name"), index: getAttr(out, "index") });
      }
      if (outputs.length > 0) result.outputs = outputs;
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transform function (user-defined function)
// ---------------------------------------------------------------------------

function parseTransformFunction(root: Element): Record<string, unknown> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const funcElem = getChild(obj, "Function");
  if (!funcElem) return null;

  const result: Record<string, unknown> = {};

  // Inputs
  const inputs: { key: string; name: string }[] = [];
  const inputsElem = getChild(funcElem, "Inputs");
  if (inputsElem) {
    for (const inp of getChildArray(inputsElem, "Input")) {
      inputs.push({ key: getAttr(inp, "key"), name: getAttr(inp, "name") });
    }
  }
  result.inputs = inputs;

  // Outputs
  const outputs: { key: string; name: string }[] = [];
  const outputsElem = getChild(funcElem, "Outputs");
  if (outputsElem) {
    for (const out of getChildArray(outputsElem, "Output")) {
      outputs.push({ key: getAttr(out, "key"), name: getAttr(out, "name") });
    }
  }
  result.outputs = outputs;

  // Steps
  const steps: TransformFunctionStep[] = [];
  const stepsElem = getChild(funcElem, "Steps");
  if (stepsElem) {
    for (const fs of getChildArray(stepsElem, "FunctionStep")) {
      const step: TransformFunctionStep = {
        key: getAttr(fs, "key"),
        type: getAttr(fs, "type"),
        name: getAttr(fs, "name"),
      };

      const configElem = getChild(fs, "Configuration");
      if (configElem) {
        const scripting = getChild(configElem, "Scripting");
        if (scripting) {
          step.language = getAttr(scripting, "language");
          const useComponent = getAttr(scripting, "useComponent", "false") === "true";
          if (useComponent) {
            step.use_component = true;
            const compId = getAttr(scripting, "componentId");
            if (compId) step.script_component_id = compId;
          } else {
            const scriptText = getChildText(scripting, "ScriptToExecute");
            if (scriptText) step.script = scriptText;
          }
        }

        const xref = getChild(configElem, "CrossRefLookup");
        if (xref) {
          step.cross_ref_table_id = getAttr(xref, "crossRefTableId");
        }

        const docCacheLookup = getChild(configElem, "DocumentCacheLookup");
        if (docCacheLookup) {
          step.doc_cache_id = getAttr(docCacheLookup, "docCache");
          step.cache_index = getAttr(docCacheLookup, "cacheIndex");
          const lookupInputs: { index: string; key_id: string; name: string }[] = [];
          for (const inp of getChildArray(docCacheLookup, "Input")) {
            lookupInputs.push({
              index: getAttr(inp, "index"),
              key_id: getAttr(inp, "keyId"),
              name: getAttr(inp, "name"),
            });
          }
          step.lookup_inputs = lookupInputs;

          const lookupOutputs: { index: string; key: string; name: string }[] = [];
          for (const out of getChildArray(docCacheLookup, "Output")) {
            lookupOutputs.push({
              index: getAttr(out, "index"),
              key: getAttr(out, "key"),
              name: getAttr(out, "name"),
            });
          }
          step.lookup_outputs = lookupOutputs;
        }

        const concat = getChild(configElem, "StringConcat");
        if (concat) {
          step.delimiter = getAttr(concat, "delimiter");
        }
      }

      steps.push(step);
    }
  }
  result.steps = steps;

  return result;
}

// ---------------------------------------------------------------------------
// Document cache
// ---------------------------------------------------------------------------

function parseDocumentCache(root: Element): Omit<DocumentCache, "name"> | null {
  const obj = getChild(root, "object");
  if (!obj) return null;

  const result: Omit<DocumentCache, "name"> = {};
  const cache = getChild(obj, "DocumentCache");
  if (cache) {
    result.max_documents = getAttr(cache, "maxDocuments");
    result.expiration = getAttr(cache, "expiration");
    const profileId = getAttr(cache, "profile");
    if (profileId) result.profile = profileId;
    const profileType = getAttr(cache, "profileType");
    if (profileType) result.profile_type = profileType;
    const enforce = getAttr(cache, "enforceSingleLucene");
    if (enforce) result.enforce_single_lucene = enforce;

    const indexes: CacheIndex[] = [];
    for (const ci of getChildArray(cache, "CacheIndex")) {
      const indexEntry: CacheIndex = {
        index_id: getAttr(ci, "indexId"),
        index_name: getAttr(ci, "indexName"),
      };
      const keys: { alias: string; element_key: string }[] = [];
      for (const ck of getChildArray(ci, "cacheKey")) {
        keys.push({
          alias: getAttr(ck, "alias"),
          element_key: getAttr(ck, "elementKey"),
        });
      }
      if (keys.length > 0) indexEntry.keys = keys;
      indexes.push(indexEntry);
    }
    if (indexes.length > 0) result.indexes = indexes;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main export directory parser
// ---------------------------------------------------------------------------

function parseExportDirectory(exportDir: string): FullOutput {
  const output: FullOutput = {
    platform: "boomi",
    source_directory: resolve(exportDir),
    components: {},
    processes: {},
    connector_settings: {},
    connector_actions: {},
    transform_maps: {},
    profiles: {},
    cross_references: {},
    process_properties: {},
    scripts: {},
    document_caches: {},
    summary: {
      total_files: 0,
      total_components: 0,
      processes: 0,
      connector_settings: 0,
      connector_actions: 0,
      transform_maps: 0,
      profiles: 0,
      cross_references: 0,
      process_properties: 0,
      scripts: 0,
      document_caches: 0,
    },
  };

  const xmlFiles = readdirSync(exportDir)
    .filter((f) => f.endsWith(".xml"))
    .sort();

  if (xmlFiles.length === 0) {
    console.error(`Error: No XML files found in ${exportDir}`);
    process.exit(2);
  }

  console.error(`Parsing ${xmlFiles.length} XML files from ${exportDir}`);

  for (const filename of xmlFiles) {
    const filepath = join(exportDir, filename);
    const parsed = parseComponentFile(filepath);
    if (parsed == null) continue;

    const compId = parsed.component_id;
    const compType = parsed.type;
    const root = parsed.root;

    // Add to components index
    output.components[compId] = {
      name: parsed.name,
      type: compType,
      sub_type: parsed.sub_type,
      file: parsed.file,
    };

    // Parse type-specific data
    if (compType === "process") {
      const processData = parseProcess(root);
      if (processData) {
        output.processes[compId] = { name: parsed.name, ...processData };
      }
    } else if (compType === "connector-settings") {
      const settings = parseConnectorSettings(root);
      if (settings) {
        output.connector_settings[compId] = {
          name: parsed.name,
          sub_type: parsed.sub_type,
          ...settings,
        };
      }
    } else if (compType === "connector-action") {
      const action = parseConnectorAction(root);
      if (action) {
        output.connector_actions[compId] = {
          name: parsed.name,
          sub_type: parsed.sub_type,
          ...action,
        };
      }
    } else if (compType === "transform.map") {
      const transform = parseTransformMap(root);
      if (transform) {
        output.transform_maps[compId] = { name: parsed.name, ...transform };
      }
    } else if (compType.startsWith("profile.")) {
      const profile = parseProfile(root, compType);
      if (profile) {
        output.profiles[compId] = { name: parsed.name, ...profile };
      }
    } else if (compType === "crossref") {
      const xref = parseCrossReference(root);
      if (xref) {
        output.cross_references[compId] = { name: parsed.name, ...xref };
      }
    } else if (compType === "processproperty") {
      const props = parseProcessProperties(root);
      if (props) {
        output.process_properties[compId] = { name: parsed.name, ...props };
      }
    } else if (compType.startsWith("script.")) {
      const script = parseScripting(root);
      if (script) {
        output.scripts[compId] = { name: parsed.name, type: compType, ...script };
      }
    } else if (compType === "documentcache") {
      const cache = parseDocumentCache(root);
      if (cache) {
        output.document_caches[compId] = { name: parsed.name, ...cache };
      }
    } else if (compType === "transform.function") {
      const func = parseTransformFunction(root);
      if (func) {
        output.scripts[compId] = { name: parsed.name, type: compType, ...func };
      }
    }
  }

  // Summary stats
  output.summary = {
    total_files: xmlFiles.length,
    total_components: Object.keys(output.components).length,
    processes: Object.keys(output.processes).length,
    connector_settings: Object.keys(output.connector_settings).length,
    connector_actions: Object.keys(output.connector_actions).length,
    transform_maps: Object.keys(output.transform_maps).length,
    profiles: Object.keys(output.profiles).length,
    cross_references: Object.keys(output.cross_references).length,
    process_properties: Object.keys(output.process_properties).length,
    scripts: Object.keys(output.scripts).length,
    document_caches: Object.keys(output.document_caches).length,
  };

  return output;
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function generateSummary(fullOutput: FullOutput): SummaryOutput {
  const summary: SummaryOutput = {
    platform: fullOutput.platform,
    source_directory: fullOutput.source_directory,
    counts: fullOutput.summary,
    processes: {},
    systems: [],
    endpoints: [],
    profiles_overview: {},
    transform_maps_overview: [],
    config_sources: [],
    scripts_overview: [],
    document_caches_overview: [],
  };

  // Process names and shape counts
  for (const [pid, process] of Object.entries(fullOutput.processes)) {
    const name = process.name ?? pid;
    const shapes = process.shapes ?? [];
    const shapeTypes: Record<string, number> = {};
    for (const shape of shapes) {
      const st = shape.type || "unknown";
      shapeTypes[st] = (shapeTypes[st] ?? 0) + 1;
    }
    const isMonitoring = ["[OTEL]", "[MONITORING]"].some((prefix) =>
      name.toUpperCase().includes(prefix),
    );
    summary.processes[pid] = {
      name,
      shape_count: shapes.length,
      shape_types: shapeTypes,
      is_monitoring: isMonitoring,
      has_connection_overrides: (process.connection_overrides ?? []).length > 0,
      has_property_overrides: (process.process_property_overrides ?? []).length > 0,
    };
  }

  // System names from connector settings
  for (const [cid, conn] of Object.entries(fullOutput.connector_settings)) {
    const name = conn.name ?? cid;
    const authType = (conn.auth_type as string) ?? "unknown";
    const url = (conn.url as string) ?? "";
    summary.systems.push({
      id: cid,
      name,
      auth_type: authType,
      url_pattern: url.length > 50 ? `${url.slice(0, 50)}...` : url,
    });
  }

  // Endpoint paths from connector actions
  for (const [aid, action] of Object.entries(fullOutput.connector_actions)) {
    const name = action.name ?? aid;
    const method = (action.method as string) ?? "";
    const pathElements = (action.path_elements as PathElement[]) ?? [];
    const path =
      pathElements.length > 0 ? `/${pathElements.map((e) => e.name ?? "").join("/")}` : "UNKNOWN";
    summary.endpoints.push({
      id: aid,
      name,
      method,
      path,
      has_response_profile: Boolean(action.response_profile),
      has_request_profile: Boolean(action.request_profile),
    });
  }

  // Profile field counts
  for (const [pid, profile] of Object.entries(fullOutput.profiles)) {
    const name = profile.name ?? pid;
    summary.profiles_overview[pid] = {
      name,
      type: profile.type ?? "",
      field_count: (profile.fields ?? []).length,
    };
  }

  // Transform map overview
  for (const [tid, tmap] of Object.entries(fullOutput.transform_maps)) {
    const name = tmap.name ?? tid;
    const mappings = tmap.mappings ?? [];
    const funcs = tmap.functions ?? [];
    summary.transform_maps_overview.push({
      id: tid,
      name,
      mapping_count: mappings.length,
      function_count: funcs.length,
      function_types: funcs.map((f) => f.type ?? ""),
    });
  }

  // Config sources (process properties)
  for (const [ppid, pp] of Object.entries(fullOutput.process_properties)) {
    const name = pp.name ?? ppid;
    const props = pp.properties ?? [];
    summary.config_sources.push({
      id: ppid,
      name,
      property_count: props.length,
      property_names: props.map((p) => p.label || p.key || ""),
    });
  }

  // Scripts and transform functions overview
  for (const [sid, script] of Object.entries(fullOutput.scripts)) {
    const entry: SummaryOutput["scripts_overview"][number] = {
      id: sid,
      name: (script.name as string) ?? sid,
      type: (script.type as string) ?? "",
    };
    if (script.type === "transform.function") {
      entry.step_count = ((script.steps as unknown[]) ?? []).length;
    }
    summary.scripts_overview.push(entry);
  }

  // Document caches overview
  for (const [cid, cache] of Object.entries(fullOutput.document_caches)) {
    summary.document_caches_overview.push({
      id: cid,
      name: cache.name ?? cid,
      index_names: (cache.indexes ?? []).map((idx) => idx.index_name),
    });
  }

  return summary;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): number {
  const summaryMode = process.argv.includes("--summary");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  if (args.length !== 1) {
    console.error("Usage: npx tsx parse-boomi-export.ts <export-directory> [--summary]");
    return 2;
  }

  const exportDir = args[0];

  try {
    const stat = statSync(exportDir);
    if (!stat.isDirectory()) {
      console.error(`Error: ${exportDir} is not a directory`);
      return 2;
    }
  } catch {
    console.error(`Error: ${exportDir} is not a directory`);
    return 2;
  }

  const result = parseExportDirectory(exportDir);

  if (summaryMode) {
    const summary = generateSummary(result);
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  return 0;
}

process.exit(main());
