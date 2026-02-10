# Data Transformation Patterns for CNI

Comprehensive data transformation patterns for Prismatic Code Native Integrations.

---

## Field Mapping

```typescript
interface SalesforceOpportunity {
  Id: string;
  Name: string;
  Account: { Name: string };
  Amount: number;
  StageName: string;
  CloseDate: string;
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    amount: string;
    dealstage: string;
    closedate: string;
  };
}

// ⭐ SALESFORCE → HUBSPOT ⭐
function transformToHubSpot(opp: SalesforceOpportunity): HubSpotDeal {
  return {
    id: opp.Id,
    properties: {
      dealname: `${opp.Name} (${opp.Account.Name})`,
      amount: opp.Amount.toString(),
      dealstage: mapStage(opp.StageName),
      closedate: new Date(opp.CloseDate).getTime().toString(),
    },
  };
}

// ⭐ STAGE MAPPING ⭐
function mapStage(sfStage: string): string {
  const stageMap = {
    Prospecting: "appointmentscheduled",
    Qualification: "qualifiedtobuy",
    Proposal: "presentationscheduled",
    "Closed Won": "closedwon",
    "Closed Lost": "closedlost",
  };
  return stageMap[sfStage] || "appointmentscheduled";
}
```

## Type Conversion

```typescript
// ⭐ STRING TO NUMBER ⭐
const amount = parseFloat(data.amount) || 0;

// ⭐ STRING TO DATE ⭐
const closeDate = new Date(data.closeDate);
if (isNaN(closeDate.getTime())) {
  throw new Error(`Invalid date: ${data.closeDate}`);
}

// ⭐ DATE TO UNIX TIMESTAMP ⭐
const timestamp = Math.floor(closeDate.getTime() / 1000);

// ⭐ BOOLEAN CONVERSION ⭐
const isActive = data.status === "active" || data.status === "1";

// ⭐ NULL/UNDEFINED HANDLING ⭐
const phone = data.phone ?? "N/A";
const email = data.email || null;
```

## Nested Data Flattening

```typescript
// Input: Nested structure
const salesforceRecord = {
  Id: "001",
  Account: {
    Name: "Acme Corp",
    BillingAddress: {
      Street: "123 Main St",
      City: "San Francisco",
      State: "CA",
    },
  },
};

// ⭐ FLATTEN ⭐
const flattened = {
  id: salesforceRecord.Id,
  accountName: salesforceRecord.Account.Name,
  billingStreet: salesforceRecord.Account.BillingAddress.Street,
  billingCity: salesforceRecord.Account.BillingAddress.City,
  billingState: salesforceRecord.Account.BillingAddress.State,
};
```

## Data Enrichment

```typescript
const opportunities = sfResult.records.map((opp) => ({
  // ⭐ BASIC FIELDS ⭐
  id: opp.Id,
  name: opp.Name,
  amount: opp.Amount || 0,
  closeDate: opp.CloseDate,

  // ⭐ COMPUTED FIELDS ⭐
  daysToClose: opp.CloseDate
    ? Math.ceil(
        (new Date(opp.CloseDate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null,

  // ⭐ FORMATTING ⭐
  formattedAmount: `$${(opp.Amount || 0).toLocaleString()}`,

  // ⭐ CATEGORIZATION ⭐
  priority:
    opp.Amount > 100000 ? "high" : opp.Amount > 10000 ? "medium" : "low",

  // ⭐ STATUS FLAGS ⭐
  isOverdue: opp.CloseDate && new Date(opp.CloseDate) < new Date(),
}));
```

---

## Best Practices

- ✅ Define clear type interfaces
- ✅ Handle null/undefined values
- ✅ Validate data types before transformation
- ✅ Map field names explicitly
- ✅ Add computed/enriched fields when useful

---

## Additional Resources

- **TypeScript Best Practices**: https://prismatic.io/docs/spectral/typescript/
- **Data Mapping Guide**: https://prismatic.io/docs/spectral/data-mapping/
