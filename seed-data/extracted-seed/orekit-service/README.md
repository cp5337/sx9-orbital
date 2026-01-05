# Orekit Service (Stub)

Tiny REST shim around Orekit to later compute access windows, az/el, and slew rates.

## Build & Run
```bash
./gradlew run
curl -X POST localhost:8088/access -d '{"latDeg":-31.95,"lonDeg":115.86,"altM":12,"startIso":"2025-10-25T16:00:00Z","endIso":"2025-10-25T17:00:00Z"}' -H 'Content-Type: application/json'
```
> Output is a stub. Replace with real propagator + access logic.
