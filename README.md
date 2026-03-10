# RTKWebserver

Веб-сервер на Python для управления манипуляторами и интеграции с Node-RED.

## Что умеет

- CRUD управление списком манипуляторов.
- Отправка команд на конкретный манипулятор через Node-RED HTTP endpoint.
- Хранение состояния манипуляторов в SQLite.

## Быстрый старт

### 1) Установка зависимостей

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) Запуск API

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Документация Swagger:

- http://localhost:8000/docs

### 3) Переменные окружения

- `DB_PATH` — путь к SQLite базе (по умолчанию `./manipulators.db`)
- `NODE_RED_BASE_URL` — базовый URL Node-RED (по умолчанию `http://localhost:1880`)
- `NODE_RED_TIMEOUT` — timeout запросов к Node-RED в секундах (по умолчанию `5`)

## Пример Node-RED flow

Импортируйте `node-red-flow.json` в Node-RED. Flow создает endpoint:

- `POST /manipulator/command`

Он принимает команду и возвращает подтверждение.

## Пример использования API

Создать манипулятор:

```bash
curl -X POST http://localhost:8000/manipulators \
  -H "Content-Type: application/json" \
  -d '{"name":"arm-01","model":"Kuka KR10","node_red_endpoint":"/manipulator/command"}'
```

Отправить команду:

```bash
curl -X POST http://localhost:8000/manipulators/1/command \
  -H "Content-Type: application/json" \
  -d '{"command":"move","payload":{"x":100,"y":50,"z":20}}'
```
