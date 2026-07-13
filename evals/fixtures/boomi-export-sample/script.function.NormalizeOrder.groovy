import com.boomi.execution.ExecutionUtil
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

// Business logic that must survive migration verbatim: derive a canonical
// order id, sum the line-item total, and classify the shipping region.
for (int i = 0; i < dataContext.getDataCount(); i++) {
    InputStream is = dataContext.getStream(i)
    Properties props = dataContext.getProperties(i)
    def order = new JsonSlurper().parse(is)

    def canonical = [
        id    : "ORD-" + order.number,
        total : order.lineItems.sum { it.qty * it.unitPrice },
        region: order.shipTo?.country == "US" ? "NA" : "INTL",
    ]

    props.setProperty("document.dynamic.userdefined.region", canonical.region)
    dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson(canonical).bytes), props)
}
