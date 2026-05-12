import type { McpTool, McpToolResult } from "./types";

const TOOL_SCHEMAS: Record<string, Record<string, McpTool>> = {
  jira: {
    get_issue: {
      name: "get_issue",
      description: "Fetch a Jira issue by key.",
      inputSchema: {
        type: "object",
        properties: { issue_key: { type: "string", description: "e.g. ABC-123" } },
        required: ["issue_key"],
      },
    },
    search_issues: {
      name: "search_issues",
      description: "Search issues with JQL.",
      inputSchema: {
        type: "object",
        properties: {
          jql: { type: "string" },
          max_results: { type: "number", default: 25 },
        },
        required: ["jql"],
      },
    },
    list_projects: {
      name: "list_projects",
      description: "List all projects.",
      inputSchema: { type: "object", properties: {} },
    },
    list_users: { name: "list_users", description: "List users.", inputSchema: { type: "object", properties: {} } },
    get_user: {
      name: "get_user",
      description: "Get a user by account id.",
      inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] },
    },
    list_boards: { name: "list_boards", description: "List boards.", inputSchema: { type: "object", properties: {} } },
    list_sprints: {
      name: "list_sprints",
      description: "List sprints for a board.",
      inputSchema: { type: "object", properties: { board_id: { type: "string" } }, required: ["board_id"] },
    },
    get_sprint: {
      name: "get_sprint",
      description: "Get sprint details.",
      inputSchema: { type: "object", properties: { sprint_id: { type: "string" } }, required: ["sprint_id"] },
    },
    create_issue: {
      name: "create_issue",
      description: "Create a Jira issue.",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string" },
          summary: { type: "string" },
          issue_type: { type: "string", default: "Task" },
        },
        required: ["project_key", "summary"],
      },
    },
    update_issue: {
      name: "update_issue",
      description: "Update an issue's fields.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" }, fields: { type: "object" } }, required: ["issue_key", "fields"] },
    },
    add_comment: {
      name: "add_comment",
      description: "Add a comment to an issue.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" }, body: { type: "string" } }, required: ["issue_key", "body"] },
    },
    transition_issue: {
      name: "transition_issue",
      description: "Transition an issue.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" }, transition_id: { type: "string" } }, required: ["issue_key", "transition_id"] },
    },
    assign_issue: {
      name: "assign_issue",
      description: "Assign an issue to a user.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" }, account_id: { type: "string" } }, required: ["issue_key", "account_id"] },
    },
    create_sprint: {
      name: "create_sprint",
      description: "Create a sprint.",
      inputSchema: { type: "object", properties: { board_id: { type: "string" }, name: { type: "string" } }, required: ["board_id", "name"] },
    },
    delete_issue: {
      name: "delete_issue",
      description: "Delete an issue.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" } }, required: ["issue_key"] },
    },
    delete_comment: {
      name: "delete_comment",
      description: "Delete a comment.",
      inputSchema: { type: "object", properties: { issue_key: { type: "string" }, comment_id: { type: "string" } }, required: ["issue_key", "comment_id"] },
    },
  },
  zoho: makeRecordTools("Zoho CRM"),
  hubspot: {
    list_contacts: { name: "list_contacts", description: "List contacts.", inputSchema: tableInputSchema() },
    get_contact: { name: "get_contact", description: "Get a contact by id.", inputSchema: idInputSchema() },
    list_deals: { name: "list_deals", description: "List deals.", inputSchema: tableInputSchema() },
    get_deal: { name: "get_deal", description: "Get a deal by id.", inputSchema: idInputSchema() },
    list_companies: { name: "list_companies", description: "List companies.", inputSchema: tableInputSchema() },
    get_company: { name: "get_company", description: "Get a company by id.", inputSchema: idInputSchema() },
    search_objects: { name: "search_objects", description: "Search HubSpot objects.", inputSchema: { type: "object", properties: { object_type: { type: "string" }, query: { type: "string" } }, required: ["object_type", "query"] } },
    list_owners: { name: "list_owners", description: "List owners.", inputSchema: { type: "object", properties: {} } },
    create_contact: { name: "create_contact", description: "Create a contact.", inputSchema: { type: "object", properties: { email: { type: "string" }, firstname: { type: "string" }, lastname: { type: "string" } }, required: ["email"] } },
    update_contact: { name: "update_contact", description: "Update a contact.", inputSchema: idInputSchema(["properties"]) },
    create_deal: { name: "create_deal", description: "Create a deal.", inputSchema: { type: "object", properties: { dealname: { type: "string" }, amount: { type: "number" } }, required: ["dealname"] } },
    update_deal: { name: "update_deal", description: "Update a deal.", inputSchema: idInputSchema(["properties"]) },
    create_company: { name: "create_company", description: "Create a company.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    update_company: { name: "update_company", description: "Update a company.", inputSchema: idInputSchema(["properties"]) },
    associate_objects: { name: "associate_objects", description: "Associate two objects.", inputSchema: { type: "object", properties: { from_id: { type: "string" }, to_id: { type: "string" }, association_type: { type: "string" } }, required: ["from_id", "to_id", "association_type"] } },
    delete_contact: { name: "delete_contact", description: "Delete a contact.", inputSchema: idInputSchema() },
    delete_deal: { name: "delete_deal", description: "Delete a deal.", inputSchema: idInputSchema() },
    delete_company: { name: "delete_company", description: "Delete a company.", inputSchema: idInputSchema() },
  },
  salesforce: {
    list_objects: { name: "list_objects", description: "List SObjects available.", inputSchema: { type: "object", properties: {} } },
    describe_object: { name: "describe_object", description: "Describe an SObject schema.", inputSchema: { type: "object", properties: { object_name: { type: "string" } }, required: ["object_name"] } },
    query_records: { name: "query_records", description: "Query records from an object.", inputSchema: tableInputSchema("object_name") },
    get_record: { name: "get_record", description: "Get a record by id.", inputSchema: { type: "object", properties: { object_name: { type: "string" }, record_id: { type: "string" } }, required: ["object_name", "record_id"] } },
    run_soql: { name: "run_soql", description: "Run a SOQL query.", inputSchema: { type: "object", properties: { soql: { type: "string" } }, required: ["soql"] } },
    list_reports: { name: "list_reports", description: "List reports.", inputSchema: { type: "object", properties: {} } },
    create_record: { name: "create_record", description: "Create a record.", inputSchema: { type: "object", properties: { object_name: { type: "string" }, fields: { type: "object" } }, required: ["object_name", "fields"] } },
    update_record: { name: "update_record", description: "Update a record.", inputSchema: { type: "object", properties: { object_name: { type: "string" }, record_id: { type: "string" }, fields: { type: "object" } }, required: ["object_name", "record_id", "fields"] } },
    upsert_record: { name: "upsert_record", description: "Upsert by external id.", inputSchema: { type: "object", properties: { object_name: { type: "string" }, external_id_field: { type: "string" }, external_id: { type: "string" }, fields: { type: "object" } }, required: ["object_name", "external_id_field", "external_id", "fields"] } },
    run_apex: { name: "run_apex", description: "Execute anonymous Apex.", inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] } },
    delete_record: { name: "delete_record", description: "Delete a record.", inputSchema: { type: "object", properties: { object_name: { type: "string" }, record_id: { type: "string" } }, required: ["object_name", "record_id"] } },
  },
  postgres: {
    list_databases: { name: "list_databases", description: "List databases.", inputSchema: { type: "object", properties: {} } },
    list_tables: { name: "list_tables", description: "List tables in a schema.", inputSchema: { type: "object", properties: { schema: { type: "string", default: "public" } } } },
    describe_table: { name: "describe_table", description: "Get table column definitions.", inputSchema: { type: "object", properties: { table_name: { type: "string" } }, required: ["table_name"] } },
    read_table: { name: "read_table", description: "Read rows from a table.", inputSchema: tableInputSchema() },
    query: { name: "query", description: "Run a SELECT query.", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
    list_schemas: { name: "list_schemas", description: "List schemas.", inputSchema: { type: "object", properties: {} } },
    insert_row: { name: "insert_row", description: "Insert a row.", inputSchema: { type: "object", properties: { table_name: { type: "string" }, row: { type: "object" } }, required: ["table_name", "row"] } },
    update_row: { name: "update_row", description: "Update a row.", inputSchema: { type: "object", properties: { table_name: { type: "string" }, where: { type: "object" }, set: { type: "object" } }, required: ["table_name", "where", "set"] } },
    execute_ddl: { name: "execute_ddl", description: "Run a DDL statement.", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
    delete_row: { name: "delete_row", description: "Delete rows from a table.", inputSchema: { type: "object", properties: { table_name: { type: "string" }, where: { type: "object" } }, required: ["table_name", "where"] } },
    drop_table: { name: "drop_table", description: "Drop a table.", inputSchema: { type: "object", properties: { table_name: { type: "string" } }, required: ["table_name"] } },
  },
};

function tableInputSchema(tableField = "table_name") {
  return {
    type: "object",
    properties: {
      [tableField]: { type: "string" },
      limit: { type: "number", default: 50 },
    },
    required: [tableField],
  };
}
function idInputSchema(extras: string[] = []) {
  const props: Record<string, { type: string }> = { id: { type: "string" } };
  for (const e of extras) props[e] = { type: "object" };
  return { type: "object", properties: props, required: ["id"] };
}
function makeRecordTools(label: string): Record<string, McpTool> {
  return {
    list_records: { name: "list_records", description: `List ${label} records.`, inputSchema: { type: "object", properties: { module: { type: "string" } }, required: ["module"] } },
    get_record: { name: "get_record", description: `Get a ${label} record by id.`, inputSchema: { type: "object", properties: { module: { type: "string" }, record_id: { type: "string" } }, required: ["module", "record_id"] } },
    search_records: { name: "search_records", description: `Search ${label} records.`, inputSchema: { type: "object", properties: { module: { type: "string" }, criteria: { type: "string" } }, required: ["module", "criteria"] } },
    list_modules: { name: "list_modules", description: `List ${label} modules.`, inputSchema: { type: "object", properties: {} } },
    list_fields: { name: "list_fields", description: `List fields for a module.`, inputSchema: { type: "object", properties: { module: { type: "string" } }, required: ["module"] } },
    get_organization: { name: "get_organization", description: `Get organization info.`, inputSchema: { type: "object", properties: {} } },
    create_record: { name: "create_record", description: `Create a record.`, inputSchema: { type: "object", properties: { module: { type: "string" }, data: { type: "object" } }, required: ["module", "data"] } },
    update_record: { name: "update_record", description: `Update a record.`, inputSchema: { type: "object", properties: { module: { type: "string" }, record_id: { type: "string" }, data: { type: "object" } }, required: ["module", "record_id", "data"] } },
    upsert_record: { name: "upsert_record", description: `Upsert a record.`, inputSchema: { type: "object", properties: { module: { type: "string" }, data: { type: "object" } }, required: ["module", "data"] } },
    convert_lead: { name: "convert_lead", description: `Convert a lead.`, inputSchema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"] } },
    delete_record: { name: "delete_record", description: `Delete a record.`, inputSchema: { type: "object", properties: { module: { type: "string" }, record_id: { type: "string" } }, required: ["module", "record_id"] } },
  };
}

export function mockUpstreamList(type: string): McpTool[] {
  return Object.values(TOOL_SCHEMAS[type] ?? {});
}

export function mockUpstreamCall(
  type: string,
  toolName: string,
  args: Record<string, unknown>,
): McpToolResult {
  const tool = TOOL_SCHEMAS[type]?.[toolName];
  if (!tool) {
    return {
      content: [{ type: "text", text: `Mock upstream has no tool '${toolName}' for type '${type}'` }],
      isError: true,
    };
  }

  if (toolName === "list_tables") {
    const sample = {
      jira: ["projects", "issues", "comments", "users"],
      hubspot: ["contacts", "deals", "companies", "tickets"],
      salesforce: ["Account", "Contact", "Opportunity", "Lead"],
      zoho: ["Leads", "Contacts", "Accounts", "Deals"],
      postgres: ["customers", "orders", "products", "invoices"],
    }[type] ?? ["table_a", "table_b"];
    return { content: [{ type: "text", text: JSON.stringify({ tables: sample }, null, 2) }] };
  }

  if (toolName.startsWith("list_") || toolName.startsWith("search_") || toolName.startsWith("query_")) {
    const rows = makeMockRows(type, args, 5);
    return { content: [{ type: "text", text: JSON.stringify({ rows, count: rows.length }, null, 2) }] };
  }

  if (toolName.startsWith("get_") || toolName === "read_table" || toolName === "describe_table") {
    const row = makeMockRows(type, args, 1)[0];
    return { content: [{ type: "text", text: JSON.stringify(row, null, 2) }] };
  }

  if (toolName.startsWith("create_") || toolName.startsWith("insert_")) {
    return {
      content: [{ type: "text", text: JSON.stringify({ id: `mock_${Date.now()}`, created: true, ...args }, null, 2) }],
    };
  }
  if (toolName.startsWith("update_") || toolName === "upsert_record" || toolName === "transition_issue" || toolName === "assign_issue") {
    return { content: [{ type: "text", text: JSON.stringify({ updated: true, ...args }, null, 2) }] };
  }
  if (toolName.startsWith("delete_") || toolName === "drop_table") {
    return { content: [{ type: "text", text: JSON.stringify({ deleted: true, ...args }, null, 2) }] };
  }

  return {
    content: [
      { type: "text", text: JSON.stringify({ tool: toolName, args, note: "Mock upstream response" }, null, 2) },
    ],
  };
}

function makeMockRows(type: string, args: Record<string, unknown>, n: number) {
  const out = [];
  const tableHint = (args.table_name as string) ?? (args.module as string) ?? (args.object_name as string) ?? type;
  for (let i = 1; i <= n; i++) {
    out.push({
      id: `${type}_${tableHint}_${i}`,
      name: `${tableHint} record #${i}`,
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      sample: true,
    });
  }
  return out;
}
