# OAuth2 Connector Example

This example shows a complete application connector using OAuth2 Authorization Code authentication with webhook triggers.

## Component Structure

```
project-manager/
├── src/
│   ├── client.ts
│   ├── types.ts
│   ├── connection.ts
│   ├── actions.ts
│   ├── triggers.ts
│   ├── dataSources.ts
│   ├── inputs.ts
│   └── index.ts
├── assets/
│   └── icon.png
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Source Files

### src/types.ts

```typescript
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: "active" | "completed" | "archived";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  assigneeId?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Project | Task;
}

export interface ApiResponse<T> {
  data: T;
}
```

### src/connection.ts

```typescript
import { connection, input, oauth2Connection, OAuth2Type } from "@prismatic-io/spectral";

// OAuth2 Authorization Code Connection (primary)
export const oauth2Auth = oauth2Connection({
  key: "projectManagerOAuth2",
  display: {
    label: "Project Manager OAuth 2.0",
    description: "Connect to Project Manager using OAuth 2.0",
  },
  oauth2Type: OAuth2Type.AuthorizationCode,
  inputs: {
    authorizeUrl: {
      label: "Authorize URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://app.projectmanager.com/oauth/authorize",
      comments: "OAuth 2.0 authorization endpoint",
    },
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      shown: true,
      default: "https://app.projectmanager.com/oauth/token",
      comments: "OAuth 2.0 token endpoint",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      required: false,
      shown: true,
      default: "read write webhooks offline_access",
      comments: "Space-separated list of OAuth scopes",
    },
    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
      shown: true,
      comments: "OAuth application client ID",
    },
    clientSecret: {
      label: "Client Secret",
      type: "password",
      required: true,
      shown: true,
      comments: "OAuth application client secret",
    },
  },
});

// API Key Connection (alternative)
export const apiKeyConnection = connection({
  key: "projectManagerApiKey",
  display: {
    label: "Project Manager API Key",
    description: "Connect to Project Manager using an API key",
  },
  inputs: {
    api_key: input({
      label: "API Key",
      type: "password",
      required: true,
      comments: "Your Project Manager API key",
    }),
  },
});

export default [oauth2Auth, apiKeyConnection];
```

### src/client.ts

```typescript
import type { Connection } from "@prismatic-io/spectral";
import {
  type HttpClient,
  createClient,
} from "@prismatic-io/spectral/dist/clients/http";
import type { Project, Task, WebhookRegistration, ApiResponse } from "./types";

interface ConstructorParams {
  connection: Connection;
  debug?: boolean;
}

export class ProjectManagerClient {
  private client: HttpClient;

  constructor({ connection, debug = false }: ConstructorParams) {
    // Support both OAuth2 tokens and API keys
    const token = connection.token?.access_token || connection.fields.api_key;

    if (!token) {
      throw new Error("No authentication credentials available. Please reconnect.");
    }

    this.client = createClient({
      baseUrl: "https://api.projectmanager.com/v1",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      debug,
    });
  }

  public readonly projects = {
    list: async (): Promise<Project[]> => {
      const response = await this.client.get<ApiResponse<Project[]>>("/projects");
      return response.data.data;
    },

    get: async (id: string): Promise<Project> => {
      const response = await this.client.get<ApiResponse<Project>>(`/projects/${id}`);
      return response.data.data;
    },

    create: async (data: Pick<Project, "name" | "description">): Promise<Project> => {
      const response = await this.client.post<ApiResponse<Project>>("/projects", data);
      return response.data.data;
    },

    update: async (id: string, data: Partial<Project>): Promise<Project> => {
      const response = await this.client.put<ApiResponse<Project>>(`/projects/${id}`, data);
      return response.data.data;
    },

    delete: async (id: string): Promise<void> => {
      await this.client.delete(`/projects/${id}`);
    },
  };

  public readonly tasks = {
    list: async (projectId: string): Promise<Task[]> => {
      const response = await this.client.get<ApiResponse<Task[]>>(
        `/projects/${projectId}/tasks`
      );
      return response.data.data;
    },

    get: async (taskId: string): Promise<Task> => {
      const response = await this.client.get<ApiResponse<Task>>(`/tasks/${taskId}`);
      return response.data.data;
    },

    create: async (projectId: string, data: Pick<Task, "title" | "description" | "dueDate">): Promise<Task> => {
      const response = await this.client.post<ApiResponse<Task>>(
        `/projects/${projectId}/tasks`,
        data
      );
      return response.data.data;
    },

    update: async (taskId: string, data: Partial<Task>): Promise<Task> => {
      const response = await this.client.put<ApiResponse<Task>>(`/tasks/${taskId}`, data);
      return response.data.data;
    },

    delete: async (taskId: string): Promise<void> => {
      await this.client.delete(`/tasks/${taskId}`);
    },
  };

  public readonly webhooks = {
    register: async (url: string, events: string[]): Promise<WebhookRegistration> => {
      const response = await this.client.post<ApiResponse<WebhookRegistration>>(
        "/webhooks",
        { url, events }
      );
      return response.data.data;
    },

    delete: async (id: string): Promise<void> => {
      await this.client.delete(`/webhooks/${id}`);
    },
  };
}
```

### src/inputs.ts

```typescript
import { input, util } from "@prismatic-io/spectral";

export const connectionInput = input({
  label: "Connection",
  type: "connection",
  required: true,
});

export const projectIdInput = input({
  label: "Project",
  type: "string",
  required: true,
  comments: "Select a project",
  clean: util.types.toString,
});

export const taskIdInput = input({
  label: "Task ID",
  type: "string",
  required: true,
  comments: "The task identifier",
  clean: util.types.toString,
});

export const nameInput = input({
  label: "Name",
  type: "string",
  required: true,
  comments: "Project name",
  clean: util.types.toString,
});

export const titleInput = input({
  label: "Title",
  type: "string",
  required: true,
  comments: "Task title",
  clean: util.types.toString,
});

export const descriptionInput = input({
  label: "Description",
  type: "string",
  required: false,
  comments: "Description",
  clean: util.types.toString,
});

export const statusInput = input({
  label: "Status",
  type: "string",
  required: false,
  comments: "Status",
  clean: util.types.toString,
});

export const dueDateInput = input({
  label: "Due Date",
  type: "string",
  required: false,
  comments: "Due date (ISO 8601 format)",
  clean: util.types.toString,
});
```

### src/actions.ts

```typescript
import { action } from "@prismatic-io/spectral";
import { ProjectManagerClient } from "./client";
import {
  connectionInput,
  projectIdInput,
  taskIdInput,
  nameInput,
  titleInput,
  descriptionInput,
  statusInput,
  dueDateInput,
} from "./inputs";

// Project actions
const listProjects = action({
  display: {
    label: "List Projects",
    description: "Get all projects",
  },
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const projects = await client.projects.list();
    return { data: projects };
  },
});

const getProject = action({
  display: {
    label: "Get Project",
    description: "Get a project by ID",
  },
  inputs: {
    connection: connectionInput,
    projectId: projectIdInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const project = await client.projects.get(params.projectId);
    return { data: project };
  },
});

const createProject = action({
  display: {
    label: "Create Project",
    description: "Create a new project",
  },
  inputs: {
    connection: connectionInput,
    name: nameInput,
    description: descriptionInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const project = await client.projects.create({
      name: params.name,
      description: params.description,
    });
    return { data: project };
  },
});

// Task actions
const listTasks = action({
  display: {
    label: "List Tasks",
    description: "Get all tasks in a project",
  },
  inputs: {
    connection: connectionInput,
    projectId: projectIdInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const tasks = await client.tasks.list(params.projectId);
    return { data: tasks };
  },
});

const createTask = action({
  display: {
    label: "Create Task",
    description: "Create a new task in a project",
  },
  inputs: {
    connection: connectionInput,
    projectId: projectIdInput,
    title: titleInput,
    description: descriptionInput,
    dueDate: dueDateInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const task = await client.tasks.create(params.projectId, {
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
    });
    return { data: task };
  },
});

const updateTaskStatus = action({
  display: {
    label: "Update Task Status",
    description: "Update the status of a task",
  },
  inputs: {
    connection: connectionInput,
    taskId: taskIdInput,
    status: {
      label: "Status",
      type: "string",
      required: true,
      model: [
        { label: "To Do", value: "todo" },
        { label: "In Progress", value: "in_progress" },
        { label: "Done", value: "done" },
      ],
    },
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const task = await client.tasks.update(params.taskId, {
      status: params.status as any,
    });
    return { data: task };
  },
});

export default {
  listProjects,
  getProject,
  createProject,
  listTasks,
  createTask,
  updateTaskStatus,
};
```

### src/triggers.ts

```typescript
import { trigger } from "@prismatic-io/spectral";
import { defaultTriggerPayload } from "@prismatic-io/spectral/dist/testing";
import { ProjectManagerClient } from "./client";
import { connectionInput } from "./inputs";

const projectWebhook = trigger({
  display: {
    label: "Project Webhook",
    description: "Triggered when a project is created, updated, or deleted",
  },
  inputs: {
    connection: connectionInput,
  },
  onInstanceDeploy: async (context, inputs) => {
    const client = new ProjectManagerClient({ connection: inputs.connection });
    const webhookUrl = context.webhookUrls[context.flow.name];

    if (!webhookUrl) {
      throw new Error("Webhook URL not found");
    }

    context.logger.info(`Registering webhook at ${webhookUrl}`);

    const registration = await client.webhooks.register(webhookUrl, [
      "project.created",
      "project.updated",
      "project.deleted",
    ]);

    context.logger.info(`Webhook registered with ID: ${registration.id}`);

    return {
      instanceState: {
        webhookId: registration.id,
      },
    };
  },
  onInstanceDelete: async (context, inputs) => {
    const webhookId = context.instanceState?.webhookId as string;

    if (!webhookId) {
      context.logger.warn("No webhook ID found in instance state");
      return;
    }

    try {
      const client = new ProjectManagerClient({ connection: inputs.connection });
      await client.webhooks.delete(webhookId);
      context.logger.info(`Webhook ${webhookId} deleted`);
    } catch (error) {
      context.logger.warn(`Error deleting webhook: ${error}`);
    }
  },
  perform: async (context, payload) => {
    const webhookData = payload.body.data as any;
    context.logger.info(`Received event: ${webhookData.event}`);
    return { payload };
  },
  examplePayload: {
    payload: {
      ...defaultTriggerPayload(),
      body: {
        data: {
          event: "project.created",
          timestamp: "2024-01-15T10:30:00Z",
          data: {
            id: "proj-123",
            name: "New Project",
            status: "active",
          },
        },
      },
    },
  },
  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});

const taskWebhook = trigger({
  display: {
    label: "Task Webhook",
    description: "Triggered when a task is created, updated, or completed",
  },
  inputs: {
    connection: connectionInput,
  },
  onInstanceDeploy: async (context, inputs) => {
    const client = new ProjectManagerClient({ connection: inputs.connection });
    const webhookUrl = context.webhookUrls[context.flow.name];

    if (!webhookUrl) {
      throw new Error("Webhook URL not found");
    }

    const registration = await client.webhooks.register(webhookUrl, [
      "task.created",
      "task.updated",
      "task.completed",
    ]);

    return {
      instanceState: {
        webhookId: registration.id,
      },
    };
  },
  onInstanceDelete: async (context, inputs) => {
    const webhookId = context.instanceState?.webhookId as string;

    if (!webhookId) return;

    try {
      const client = new ProjectManagerClient({ connection: inputs.connection });
      await client.webhooks.delete(webhookId);
    } catch (error) {
      context.logger.warn(`Error deleting webhook: ${error}`);
    }
  },
  perform: async (context, payload) => {
    return { payload };
  },
  examplePayload: {
    payload: {
      ...defaultTriggerPayload(),
      body: {
        data: {
          event: "task.completed",
          timestamp: "2024-01-15T10:30:00Z",
          data: {
            id: "task-456",
            title: "Completed Task",
            status: "done",
          },
        },
      },
    },
  },
  scheduleSupport: "invalid",
  synchronousResponseSupport: "valid",
});

export default { projectWebhook, taskWebhook };
```

### src/dataSources.ts

```typescript
import { dataSource } from "@prismatic-io/spectral";
import { ProjectManagerClient } from "./client";
import { connectionInput } from "./inputs";

const projectList = dataSource({
  display: {
    label: "Projects",
    description: "Select a project",
  },
  dataSourceType: "picklist",
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new ProjectManagerClient({ connection: params.connection });
    const projects = await client.projects.list();

    return {
      result: projects.map((project) => ({
        label: project.name,
        key: project.id,
      })),
    };
  },
});

const taskStatusList = dataSource({
  display: {
    label: "Task Status",
    description: "Select a task status",
  },
  dataSourceType: "picklist",
  inputs: {},
  perform: async () => {
    return {
      result: [
        { label: "To Do", key: "todo" },
        { label: "In Progress", key: "in_progress" },
        { label: "Done", key: "done" },
      ],
    };
  },
});

export default { projectList, taskStatusList };
```

### src/index.ts

```typescript
import { component } from "@prismatic-io/spectral";
import actions from "./actions";
import triggers from "./triggers";
import dataSources from "./dataSources";
import connections from "./connection";

export default component({
  key: "project-manager",
  public: false,
  display: {
    label: "Project Manager",
    description: "Manage projects and tasks with OAuth2 authentication",
    iconPath: "icon.png",
  },
  actions,
  triggers,
  dataSources,
  connections,
});
```

## Key Points

1. **OAuth2 token access** - Use `connection.token?.access_token`
2. **Fallback to API key** - Support both OAuth2 and API key in client
3. **Webhook lifecycle** - Register in `onInstanceDeploy`, cleanup in `onInstanceDelete`
4. **Instance state** - Store webhook IDs for cleanup
5. **Multiple triggers** - Separate triggers for different event types
6. **Example payloads** - Required for integration testing
