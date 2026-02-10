# Utility Component Example

This example shows a complete utility component that provides string manipulation actions.

## Component Structure

```
string-utils/
├── src/
│   ├── actions.ts
│   ├── inputs.ts
│   └── index.ts
├── assets/
│   └── icon.png
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Source Files

### src/index.ts

```typescript
import { component } from "@prismatic-io/spectral";
import actions from "./actions";

export default component({
  key: "string-utils",
  public: false,
  display: {
    label: "String Utilities",
    description: "Utility actions for string manipulation",
    iconPath: "icon.png",
  },
  actions,
});
```

### src/inputs.ts

```typescript
import { input, util } from "@prismatic-io/spectral";

export const textInput = input({
  label: "Text",
  type: "string",
  required: true,
  comments: "The text to process",
  clean: util.types.toString,
});

export const delimiterInput = input({
  label: "Delimiter",
  type: "string",
  required: false,
  default: ",",
  comments: "The delimiter to use for splitting/joining",
  clean: util.types.toString,
});

export const findInput = input({
  label: "Find",
  type: "string",
  required: true,
  comments: "Text to find",
  clean: util.types.toString,
});

export const replaceInput = input({
  label: "Replace With",
  type: "string",
  required: true,
  comments: "Replacement text",
  clean: util.types.toString,
});

export const caseSensitiveInput = input({
  label: "Case Sensitive",
  type: "boolean",
  required: false,
  default: "true",
  comments: "Whether the operation is case sensitive",
  clean: util.types.toBool,
});
```

### src/actions.ts

```typescript
import { action } from "@prismatic-io/spectral";
import {
  textInput,
  delimiterInput,
  findInput,
  replaceInput,
  caseSensitiveInput,
} from "./inputs";

const toUpperCase = action({
  display: {
    label: "To Upper Case",
    description: "Convert text to uppercase",
  },
  inputs: {
    text: textInput,
  },
  perform: async (context, params) => {
    return { data: params.text.toUpperCase() };
  },
});

const toLowerCase = action({
  display: {
    label: "To Lower Case",
    description: "Convert text to lowercase",
  },
  inputs: {
    text: textInput,
  },
  perform: async (context, params) => {
    return { data: params.text.toLowerCase() };
  },
});

const trim = action({
  display: {
    label: "Trim",
    description: "Remove whitespace from both ends of text",
  },
  inputs: {
    text: textInput,
  },
  perform: async (context, params) => {
    return { data: params.text.trim() };
  },
});

const split = action({
  display: {
    label: "Split",
    description: "Split text into an array by delimiter",
  },
  inputs: {
    text: textInput,
    delimiter: delimiterInput,
  },
  perform: async (context, params) => {
    return { data: params.text.split(params.delimiter) };
  },
});

const join = action({
  display: {
    label: "Join",
    description: "Join an array into a string",
  },
  inputs: {
    text: {
      label: "Array",
      type: "string",
      required: true,
      collection: "valuelist",
      comments: "The array of strings to join",
    },
    delimiter: delimiterInput,
  },
  perform: async (context, params) => {
    const items = Array.isArray(params.text) ? params.text : [params.text];
    return { data: items.join(params.delimiter) };
  },
});

const replace = action({
  display: {
    label: "Replace",
    description: "Replace occurrences of text",
  },
  inputs: {
    text: textInput,
    find: findInput,
    replace: replaceInput,
    caseSensitive: caseSensitiveInput,
  },
  perform: async (context, params) => {
    if (params.caseSensitive) {
      return { data: params.text.replaceAll(params.find, params.replace) };
    } else {
      const regex = new RegExp(params.find, "gi");
      return { data: params.text.replace(regex, params.replace) };
    }
  },
});

const length = action({
  display: {
    label: "Length",
    description: "Get the length of text",
  },
  inputs: {
    text: textInput,
  },
  perform: async (context, params) => {
    return { data: params.text.length };
  },
});

const contains = action({
  display: {
    label: "Contains",
    description: "Check if text contains a substring",
  },
  inputs: {
    text: textInput,
    find: findInput,
    caseSensitive: caseSensitiveInput,
  },
  perform: async (context, params) => {
    if (params.caseSensitive) {
      return { data: params.text.includes(params.find) };
    } else {
      return {
        data: params.text.toLowerCase().includes(params.find.toLowerCase()),
      };
    }
  },
});

export default {
  toUpperCase,
  toLowerCase,
  trim,
  split,
  join,
  replace,
  length,
  contains,
};
```

## Key Points

1. **No connection needed** - Utility components don't require external APIs
2. **Simple inputs** - Focus on the data being processed
3. **Pure functions** - Actions transform input to output without side effects
4. **Type safety** - Use input cleaning functions for type coercion
