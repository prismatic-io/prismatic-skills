# Theming and Internationalization

## Theming

### Light and Dark Mode

By default, the embedded marketplace follows the customer's OS dark/light mode preference. To force a specific theme:

```typescript
// Per-call override
prismatic.showMarketplace({
  selector: "#marketplace-div",
  theme: "LIGHT", // or "DARK"
});

// Global default via init
prismatic.init({ theme: "LIGHT" });
```

Themes are configured in your Prismatic org settings under **Organization name → Theme tab**. There are four theme mode options:
- **Light** / **Dark** — for internal Prismatic users only
- **Embedded Light** / **Embedded Dark** — what your customers see

Use the **Embedded Light** and **Embedded Dark** theme tabs to customize the colors your customers see.

### Custom Font

Use any font from Google Fonts. Pass the font family name(s) to `prismatic.init`:

```typescript
prismatic.init({
  fontConfiguration: {
    google: {
      families: ["Inter", "Roboto Mono"],
    },
  },
});
```

### Customizing the Loading Screen

Configure the background and icon/text colors shown while the iframe initializes:

```typescript
// Global (via init)
prismatic.init({
  screenConfiguration: {
    initializing: {
      background: "#1a1a2e",
      color: "#ffffff",
    },
  },
});

// Per-call override
prismatic.showMarketplace({
  selector: "#marketplace-div",
  screenConfiguration: {
    initializing: {
      background: "rgb(5, 102, 0)",
      color: "rgba(255, 153, 255, 0.8)",
    },
  },
});
```

Accepts any valid CSS color value: hex, rgb, rgba, named colors.

### Renaming "Integration" and "Marketplace"

You can rebrand these terms across the entire embedded UI:

1. Go to your organization settings in Prismatic
2. Open the **Embedded** tab
3. Set custom names (e.g., "Integration" → "Solution", "Marketplace" → "App Store")

These custom terms appear throughout the embedded marketplace and workflow builder interfaces. For multi-language support, combine this with i18n phrases (see below).

## Internationalization (i18n)

The `@prismatic-io/translations` package (included with `@prismatic-io/embedded`) enables full localization.

### Setup

Pass a `translation` object to `prismatic.init` (applies to all screens) or to individual screen calls (per-screen override):

```typescript
prismatic.init({
  translation: {
    phrases: {
      // Static string replacements:
      "integration-marketplace__filterBar.allButton": "Tous",
      "integration-marketplace__filterBar.activateButton": "Activer",

      // Complex phrase with variable (%{organization} is interpolated):
      "activateIntegrationDialog.banner.text--isNotConfigurable": {
        _: "Veuillez contacter %{organization} pour activer cette intégration",
      },
    },
  },
});
```

### Finding Translation Keys

Enable debug mode to see phrase keys displayed in the UI:

```typescript
prismatic.init({
  translation: {
    debugMode: true,
  },
});
```

Debug mode shows the phrase key and current value next to every UI string, making it easy to find the key for any text you want to translate.

### Namespaced Phrases

Some phrases are shared across pages. To customize per-page, prefix with a namespace:

```typescript
// Format: NAMESPACE__PHRASE-KEY
prismatic.init({
  translation: {
    phrases: {
      "integrations.id.alert-monitors__common.loading": "Chargement en cours...",
    },
  },
});
```

### Dynamic Phrases (Custom Content Translation)

Translate your own content (integration names, config variable names, config wizard page titles, flow names, step names):

```typescript
prismatic.init({
  translation: {
    phrases: {
      dynamicPhrase: {
        // Integration and config content:
        "Salesforce":                                    "Salesforce",
        "Sync contacts to CRM":                         "Synchroniser les contacts",
        "Salesforce Configuration":                     "Configuration de Salesforce",
        "Enter your Salesforce credentials":            "Entrez vos identifiants",
        "Salesforce Connection":                        "Connexion Salesforce",
        // HTML helper text must be translated as the full HTML string:
        "<h1>OAuth Setup</h1>":                         "<h1>Configuration OAuth</h1>",
      },
    },
  },
});
```

Dynamic phrase keys must match exactly (including capitalization and punctuation).

### Listing All Dynamic Phrases

To get a complete list of all translatable dynamic phrases for your account:

```bash
prism translations:list
```

This generates a `translations_output.json` file in the current directory containing all phrase keys.

### Per-Screen Translation Override

```typescript
prismatic.showMarketplace({
  selector: "#marketplace-div",
  translation: {
    phrases: {
      "integration-marketplace__filterBar.allButton": "Alle",
    },
  },
});
```

### Three Phrase Categories

| Category | Type | Example |
|----------|------|---------|
| `SimplePhrase` | `string` | `"integration-marketplace__filterBar.allButton": "Todos"` |
| `ComplexPhrase` | `{ _: string }` | `{ _: "Contacte %{organization} para activar" }` |
| Dynamic Phrases | `Record<string, string>` inside `dynamicPhrase` key | `{ "Salesforce": "Salesforce" }` |
