# UDP Lamp Web Control Platform

Web-based real-time dashboard for controlling an industrial training signal tower lamp over UDP.

## Run

```bash
python web_server.py
```

Open: `http://localhost:8000`

## Structure

- `system/config.py`
- `system/lamp_controller.py`
- `system/lamp_monitor.py`
- `system/logger.py`
- `web_server.py`
- `templates/dashboard.html`
- `static/dashboard.js`
- `static/style.css`
- `logs/lamp_log.txt`

## API

- `GET /`
- `GET /api/lamp/state`
- `POST /api/lamp/<command>` (`red|blue|green|yellow|off`)
- `GET /api/logs`

## Notes

- UDP device: `192.168.254.101:8888`
- Listener: `0.0.0.0:8889`
- Replace command payloads in `system/config.py` with actual lamp protocol bytes.
