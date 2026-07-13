import { flow } from "@prismatic-io/spectral";
import { createClient } from "./client";

// Generated CNI flow for the "Order Sync" migration.
export const orderSync = flow({
  name: "Order Sync",
  stableKey: "order-sync",
  description: "Receives an order webhook and creates it in the Orders API",
  onTrigger: async (context, payload) => {
    return Promise.resolve({ payload });
  },
  onExecution: async (context, params) => {
    const order = params.onTrigger.results.body.data;

    // TODO: translate normalizeOrder Groovy script
    const normalized = order;

    const client = createClient(context);

    const resp = await client.post("/api/v3/orders/bulk", {
      orderId: normalized.orderId,
      customerEmail: normalized.customerEmail,
      lineItems: normalized.lineItems,
    });

    if (resp.status !== 200) {
      throw new Error("Failed to create order");
    }

    return { data: resp.data.order };
  },
});
