# API Key Connector Example

This example shows a complete application connector using API Key authentication.

## Component Structure

```
simple-crm/
├── src/
│   ├── client.ts
│   ├── types.ts
│   ├── connection.ts
│   ├── actions.ts
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
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    perPage: number;
  };
}
```

### src/connection.ts

```typescript
import { connection, input } from "@prismatic-io/spectral";

export const apiKeyConnection = connection({
  key: "simpleCrmApiKey",
  display: {
    label: "Simple CRM API Key",
    description: "Connect to Simple CRM using an API key",
  },
  inputs: {
    api_key: input({
      label: "API Key",
      type: "password",
      required: true,
      comments: "Your Simple CRM API key from Settings > API",
    }),
    base_url: input({
      label: "Base URL",
      type: "string",
      required: false,
      default: "https://api.simplecrm.com/v1",
      comments: "API base URL (change for self-hosted instances)",
    }),
  },
});

export default [apiKeyConnection];
```

### src/client.ts

```typescript
import type { Connection } from "@prismatic-io/spectral";
import {
  type HttpClient,
  createClient,
} from "@prismatic-io/spectral/dist/clients/http";
import type { Contact, ApiResponse } from "./types";

interface ConstructorParams {
  connection: Connection;
  debug?: boolean;
}

export class SimpleCrmClient {
  private client: HttpClient;

  constructor({ connection, debug = false }: ConstructorParams) {
    const apiKey = connection.fields.api_key as string;
    const baseUrl =
      (connection.fields.base_url as string) || "https://api.simplecrm.com/v1";

    if (!apiKey) {
      throw new Error("API key is required");
    }

    this.client = createClient({
      baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      debug,
    });
  }

  public readonly contacts = {
    list: async (page = 1, perPage = 50): Promise<Contact[]> => {
      const response = await this.client.get<ApiResponse<Contact[]>>(
        `/contacts?page=${page}&perPage=${perPage}`
      );
      return response.data.data;
    },

    get: async (id: string): Promise<Contact> => {
      const response = await this.client.get<ApiResponse<Contact>>(
        `/contacts/${id}`
      );
      return response.data.data;
    },

    create: async (data: Omit<Contact, "id" | "createdAt" | "updatedAt">): Promise<Contact> => {
      const response = await this.client.post<ApiResponse<Contact>>(
        "/contacts",
        data
      );
      return response.data.data;
    },

    update: async (id: string, data: Partial<Contact>): Promise<Contact> => {
      const response = await this.client.put<ApiResponse<Contact>>(
        `/contacts/${id}`,
        data
      );
      return response.data.data;
    },

    delete: async (id: string): Promise<void> => {
      await this.client.delete(`/contacts/${id}`);
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

export const contactIdInput = input({
  label: "Contact ID",
  type: "string",
  required: true,
  comments: "The unique identifier for the contact",
  clean: util.types.toString,
});

export const firstNameInput = input({
  label: "First Name",
  type: "string",
  required: true,
  comments: "Contact's first name",
  clean: util.types.toString,
});

export const lastNameInput = input({
  label: "Last Name",
  type: "string",
  required: true,
  comments: "Contact's last name",
  clean: util.types.toString,
});

export const emailInput = input({
  label: "Email",
  type: "string",
  required: true,
  comments: "Contact's email address",
  clean: util.types.toString,
});

export const phoneInput = input({
  label: "Phone",
  type: "string",
  required: false,
  comments: "Contact's phone number",
  clean: util.types.toString,
});

export const companyInput = input({
  label: "Company",
  type: "string",
  required: false,
  comments: "Contact's company name",
  clean: util.types.toString,
});
```

### src/actions.ts

```typescript
import { action } from "@prismatic-io/spectral";
import { SimpleCrmClient } from "./client";
import {
  connectionInput,
  contactIdInput,
  firstNameInput,
  lastNameInput,
  emailInput,
  phoneInput,
  companyInput,
} from "./inputs";

const listContacts = action({
  display: {
    label: "List Contacts",
    description: "Get a list of all contacts",
  },
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const contacts = await client.contacts.list();
    return { data: contacts };
  },
});

const getContact = action({
  display: {
    label: "Get Contact",
    description: "Get a specific contact by ID",
  },
  inputs: {
    connection: connectionInput,
    contactId: contactIdInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const contact = await client.contacts.get(params.contactId);
    return { data: contact };
  },
});

const createContact = action({
  display: {
    label: "Create Contact",
    description: "Create a new contact",
  },
  inputs: {
    connection: connectionInput,
    firstName: firstNameInput,
    lastName: lastNameInput,
    email: emailInput,
    phone: phoneInput,
    company: companyInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    const contact = await client.contacts.create({
      firstName: params.firstName,
      lastName: params.lastName,
      email: params.email,
      phone: params.phone,
      company: params.company,
    });
    return { data: contact };
  },
});

const updateContact = action({
  display: {
    label: "Update Contact",
    description: "Update an existing contact",
  },
  inputs: {
    connection: connectionInput,
    contactId: contactIdInput,
    firstName: { ...firstNameInput, required: false },
    lastName: { ...lastNameInput, required: false },
    email: { ...emailInput, required: false },
    phone: phoneInput,
    company: companyInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });

    const updates: Record<string, any> = {};
    if (params.firstName) updates.firstName = params.firstName;
    if (params.lastName) updates.lastName = params.lastName;
    if (params.email) updates.email = params.email;
    if (params.phone) updates.phone = params.phone;
    if (params.company) updates.company = params.company;

    const contact = await client.contacts.update(params.contactId, updates);
    return { data: contact };
  },
});

const deleteContact = action({
  display: {
    label: "Delete Contact",
    description: "Delete a contact",
  },
  inputs: {
    connection: connectionInput,
    contactId: contactIdInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
      debug: context.debug.enabled,
    });
    await client.contacts.delete(params.contactId);
    return { data: { success: true, deletedId: params.contactId } };
  },
});

export default {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
};
```

### src/dataSources.ts

```typescript
import { dataSource } from "@prismatic-io/spectral";
import { SimpleCrmClient } from "./client";
import { connectionInput } from "./inputs";

const contactList = dataSource({
  display: {
    label: "Contacts",
    description: "Select a contact",
  },
  dataSourceType: "picklist",
  inputs: {
    connection: connectionInput,
  },
  perform: async (context, params) => {
    const client = new SimpleCrmClient({
      connection: params.connection,
    });

    const contacts = await client.contacts.list();

    return {
      result: contacts.map((contact) => ({
        label: `${contact.firstName} ${contact.lastName} (${contact.email})`,
        key: contact.id,
      })),
    };
  },
});

export default { contactList };
```

### src/index.ts

```typescript
import { component } from "@prismatic-io/spectral";
import actions from "./actions";
import dataSources from "./dataSources";
import connections from "./connection";

export default component({
  key: "simple-crm",
  public: false,
  display: {
    label: "Simple CRM",
    description: "Interact with the Simple CRM API",
    iconPath: "icon.png",
  },
  actions,
  dataSources,
  connections,
});
```

## Key Points

1. **API Key in connection fields** - Access via `connection.fields.api_key`
2. **Bearer token format** - Most APIs use `Authorization: Bearer {key}`
3. **Configurable base URL** - Allows for different environments
4. **CRUD actions** - Standard create, read, update, delete operations
5. **Data sources** - Provide dropdowns for selecting resources
