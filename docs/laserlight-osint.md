# LaserLight Communications OSINT Intelligence Report

**Date:** 2026-01-15
**Classification:** Open Source Intelligence
**Compiled for:** sx9-orbital integration

---

## Executive Summary

LaserLight Communications is deploying the world's first all-optical hybrid global network (HALO) using MEO satellite constellation and terrestrial fiber. Key strategic partner **Equinix** provides ground station locations inside their data centers globally. Recent African expansion (2024-2025) with facilities in South Africa presents integration opportunity.

---

## Company Overview

| Attribute | Details |
|-----------|---------|
| **Legal Entity** | Laser Light Communications, LLC (Delaware) |
| **UK Entity** | Laser Light Global, LTD |
| **Africa Entity** | Laser Light Africa (South Africa) |
| **Website** | https://www.laserlightcomms.com |
| **HQ US** | Reston, Virginia |
| **HQ UK** | London |
| **HQ Australia** | Melbourne |
| **Key Executive** | Robert Brumley, Senior Managing Director |

---

## HALO Network Architecture

### Satellite Constellation
| Parameter | Value |
|-----------|-------|
| **Constellation Name** | SpaceCable™ |
| **Orbit Type** | MEO (Medium Earth Orbit) |
| **Satellite Count** | 8-12 planned |
| **Total Capacity** | +33 Tbps (upgraded from initial 7.2 Tbps) |
| **Inter-satellite Links** | 48 optical crosslinks @ 200 Gbps each |
| **Sat-Ground Links** | 72 links @ 100 Gbps each |
| **Spectrum** | None required (all-optical, no RF) |
| **Prime Contractor** | Ball Aerospace |

### Ground Network
| Component | Details |
|-----------|---------|
| **Optical Ground Nodes** | 100 planned worldwide |
| **Ground Network Name** | XGNS (Extended Ground Network System) |
| **Operating System** | StarBeam™ OS |
| **Network Type** | Software-Defined WAN |
| **Fiber Network** | Greenfield all-optical |

---

## Strategic Partners

### Tier 1 Partners

| Partner | Role | Integration Point |
|---------|------|-------------------|
| **Equinix** | Strategic Interconnection Provider | PoPs inside IBX data centers |
| **Ball Aerospace** | Satellite Prime Contractor | Built satellite fleet |
| **Nokia** | Network Acceleration | Scaling deployment |

### Technology Partners

| Partner | Role |
|---------|------|
| **ATLAS Space Operations** | Ground Software as a Service (GSaaS) |
| **CloudSmartz** | StarBeam OS development, SDN |
| **Xenesis** | Empower Space Alliance (optical distribution) |

### African Partners

| Partner | Role | Location |
|---------|------|----------|
| **Digital Parks Africa (DPA)** | Data center / Edge node | Centurion, Gauteng |
| **Raxio Group** | Data center operator | Pan-African |
| **Javilian Global** | Telecoms infrastructure | Pan-African |
| **WIOCC** | Undersea cables | East Africa |

---

## Ground Station Locations

### Confirmed Equinix PoPs (Initial)

| Location | Facility | Status |
|----------|----------|--------|
| Ashburn, Virginia | DC11 IBX | Operational (first) |
| London, UK | TBD | Planned |
| Tokyo, Japan | TBD | Planned |
| São Paulo, Brazil | TBD | Planned |
| Sydney, Australia | TBD | Planned |
| Dubai, UAE | TBD | Planned |

### HALO Centre Locations (Global NOCs)

| Location | Status |
|----------|--------|
| Dover, Kent, UK | Selected |
| Australia | Beta operational |
| United States | Beta planned |
| Chile | Beta planned |
| Spain | Beta planned |
| Africa | Beta planned |

### Africa Deployments

| Location | Facility | Partner | Status |
|----------|----------|---------|--------|
| **Centurion/Samrand, Gauteng** | Tier III Data Center | Digital Parks Africa | MoU signed Nov 2025 |
| Johannesburg | TBD | TBD | Registered Nov 2024 |
| Cape Town | Data Center | DPA | In development |
| Pretoria | Data Center | DPA | In development |
| Kenya (IX Kenya) | Interconnection | DPA | Connectivity planned |

**Special Note:** MODI (Modular Data Infrastructure) - 20-foot modular micro-data center being deployed in Africa as "first for the continent"

---

## Services

### Optical Satellite as a Service (O-SaaS)

| Service | Description |
|---------|-------------|
| **Global Access Circuits** | 100 Gbps dedicated circuits |
| **HALO Direct Connect** | Direct enterprise connection |
| **SpaceCable** | Equivalent to terrestrial/submarine cable |

### Target Markets
- Global enterprises
- Data centers
- Media companies
- Finance/trading firms
- Carriers/telcos
- Government entities

---

## Technical Specifications (FSO)

| Parameter | Value |
|-----------|-------|
| **Wavelength** | 1550 nm (C-band, eye-safe) |
| **Technology** | Free Space Optics (FSO) |
| **Latency** | Lower than GEO (MEO orbit) |
| **Security** | Enhanced (narrow beam, no RF intercept) |
| **Weather Mitigation** | Terrestrial fiber bypass via XGNS |

---

## Competitive Landscape

| Company | Status |
|---------|--------|
| **Starlink** | LEO, RF-based, consumer focus |
| **OneWeb** | LEO, RF-based, B2B |
| **Amazon Kuiper** | LEO, RF-based, not launched |
| **SES O3b mPOWER** | MEO, RF-based, operational |
| **LaserLight** | MEO, All-optical, unique positioning |

**LaserLight Differentiators:**
1. Only all-optical commercial constellation
2. No spectrum licensing required
3. Enhanced security (optical beam)
4. Lower latency than GEO alternatives
5. Equinix integration (instant enterprise access)

---

## sx9-orbital Integration Opportunities

### Ground Station Mapping
1. Map Equinix IBX locations to our 257 cable landing points
2. Identify overlap with DPA/Raxio African facilities
3. Model optical ground terminal placement

### Constellation Modeling
1. 8-12 MEO satellites → Walker Delta compatible
2. Model inter-satellite optical links
3. Integrate with existing beam-routing crate

### Arbitrage Routing
1. Weather-aware FSO link availability
2. Multi-path routing through constellation
3. Terrestrial bypass when optical degraded

### Business Integration Points
1. Equinix Fabric API integration
2. ATLAS GSaaS compatibility
3. StarBeam OS interface potential

---

## Sources

- [Equinix Press Release (2016)](https://www.equinix.com/newsroom/press-releases/2016/10/laser-light-partners-with-equinix-to-deploy-world-s-first-laser-based-communications-network)
- [PRNewswire Equinix Partnership](https://www.prnewswire.com/news-releases/laser-light-partners-with-equinix-to-deploy-worlds-first-laser-based-communications-network-300342336.html)
- [Data Center Dynamics](https://www.datacenterdynamics.com/en/news/equinix-and-laser-light-to-launch-laser-based-space-network/)
- [CloudSmartz Partnership](https://cloudsmartz.com/insights/laser-light-partners-cloudsmartz-deploy-worlds-first-laser-based-global-communications-network/)
- [ATLAS Space Operations JV](https://atlasspace.com/xenesis-atlas-laser-light-form-first-space-to-ground-all-optical-global-data-distribution-joint-venture/)
- [Laser Light Africa Launch](https://www.laserlightcomms.com/laser-light-africa-opens-for-business/)
- [Digital Parks Africa MoU](https://it-online.co.za/2025/11/16/laser-light-africa-signs-up-with-digital-parks-africa/)
- [Ball Aerospace Selection](https://www.ball.com/newswire/article/123256/ball-aerospace-selected-to-prime-first-commercial-laser-communications-satellite-fleet)
- [SatSearch HALO Network](https://satsearch.co/products/laserlightcomms-halo-global-network)

---

## Next Steps for sx9

1. **Map Equinix IBX locations** to ground station database
2. **Model HALO constellation** using Walker Delta parameters
3. **Integrate weather API** for FSO link availability
4. **Build Cesium visualization** of LaserLight network overlay
5. **Design arbitrage routing** for multi-domain optical paths
