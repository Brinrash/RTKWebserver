# SCADA UDP Lamp Webserver

Полностью переписанная SCADA-подобная система управления сигнальными лампами по UDP.

## Возможности

- Flask + Socket.IO backend.
- Чистый JavaScript frontend без фреймворков.
- UDP-команды устройствам и UDP-мониторинг реального состояния.
- SCADA-подход: UI обновляется только по потоку состояния от устройств.
- Поддержка нескольких ламп и режима `ALL`.
- Стандартные программы, custom JSON, phase table и конструктор программ.
- Динамическое добавление ламп из UI без перезапуска.
- Раздельные логи: `logs/info.log`, `logs/debug.log`, `logs/error.log`.

## Запуск

```bash
python web_server.py
```

Открыть: `http://localhost:8000`

## Основные API

- `GET /api/bootstrap` — стартовые данные для UI.
- `POST /api/lamps` — добавить новую лампу.
- `POST /api/lamp/<lamp>/command/<command>` — отправить команду (`RED`, `BLUE`, `GREEN`, `YELLOW`, `OFF`).
- `POST /api/program/<lamp>/<name>` — запустить стандартную программу.
- `POST /api/program/custom/<lamp>` — запустить JSON-программу.
- `POST /api/program/phase/<lamp>` — запустить phase table.
- `POST /api/program/stop/<lamp>` — остановить программу.
- `GET /api/logs` — получить tail логов.

## UDP поток состояния

Ожидаемый основной формат пакета:

```text
leds: r: 0 b: 0 g: 0 y: 1
```

Резервно поддерживается старый бинарный текстовый формат из 4 символов, например `0010`.

## Структура

- `web_server.py` — API, Socket.IO и orchestration.
- `system/config.py` — конфигурация.
- `system/logger.py` — раздельные логи.
- `system/lamp_controller.py` — UDP-команды и state model.
- `system/lamp_monitor.py` — UDP listener/monitor.
- `system/program_runner.py` — выполнение программ для одной лампы и `ALL`.
- `templates/dashboard.html` — UI.
- `static/dashboard.js` — единый frontend state manager.
- `static/style.css` — стили.
