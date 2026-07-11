// Groovy transform referenced by the Boomi process. It is NOT an .xml/.json
// export file, so detect-platform must exclude it from the platform sniff.
def order = new groovy.json.JsonSlurper().parse(dataContext.getStream(0))
dataContext.storeStream(
  new ByteArrayInputStream(groovy.json.JsonOutput.toJson([id: "ORD-" + order.number]).bytes),
  dataContext.getProperties(0),
)
