# YAMCS Seed (CTAS Optical)

Minimal mission instance for spinning up YAMCS for TM/TC experiments.

## Quickstart
```bash
docker compose up -d
open http://localhost:8090
```
Use the built-in web UI, then add the `ctas_optical` instance.

## Files
- `yamcs/etc/yamcs.yaml` : server config
- `yamcs/etc/mops/ctas_optical.xtce.xml` : minimal XTCE dict (1 packet)
- `yamcs/etc/mission/instances/ctas_optical.yaml` : instance wiring

> This is a scaffold: extend with real XTCE items, alarms, and timelines.
