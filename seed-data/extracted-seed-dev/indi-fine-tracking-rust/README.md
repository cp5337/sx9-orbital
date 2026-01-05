# INDI Fine-Tracking (Rust, Scaffold)

A minimal scaffold for a fine-tracking loop that talks to an INDI server (port 7624).

## Run
```bash
INDI_HOST=127.0.0.1 INDI_PORT=7624 cargo run
```

## Next Steps
- Implement INDI XML parsing (or generate from XSD).
- Add guide camera capture (feature `vision`, OpenCV) and centroiding.
- Implement PID and send mount rate commands.
