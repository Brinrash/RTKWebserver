# SCADA UDP Lamp Webserver

Веб-приложение на Flask + Socket.IO для управления сигнальными лампами по UDP и отдельной вкладкой управления манипулятором.

---

## 1) Что умеет проект

### Лампы (`/`)
- Управление одной лампой или группой `ALL`.
- Отправка команд: `RED`, `YELLOW`, `GREEN`, `BLUE`, `OFF`.
- Запуск стандартных программ, JSON-программ и phase-table.
- Добавление/редактирование/удаление ламп без перезапуска.
- Мониторинг фактического состояния ламп по UDP-пакетам.
- Системные логи в UI + файлы `info/debug/error`.

### Манипулятор (`/manipulator`)
- Отправка коротких команд: `1`, `2`, `3`, `r`, `s`.
- Отправка позиционного пакета: `p:<angle>:<distance>:<marker>#`.
- Получение лимитов и дефолтной цели из backend-конфига.
- Сохранение целей манипулятора (host/port/protocol) в `localStorage`.
- Отображение последнего результата и ограничений контроллера.

---

## 2) Технологии

- **Backend:** Flask, Flask-SocketIO
- **Frontend:** Vanilla JS + HTML + CSS
- **Транспорт к устройствам:** UDP (для ламп и манипулятора), TCP/UDP для манипулятора по конфигу
- **Логи:** раздельные файлы + in-memory tail

---

## 3) Быстрый старт

### Требования
- Python 3.10+
- Linux/Windows/macOS

### Установка
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Запуск
```bash
python web_server.py
```

Открыть в браузере:
- `http://localhost:8000/` — лампы
- `http://localhost:8000/manipulator` — манипулятор

---

## 4) Конфигурация

Основные параметры находятся в `system/config.py`:
- host/port веб-сервера;
- настройки UDP-монитора;
- дефолтные лампы;
- пути к логам;
- параметры манипулятора (лимиты, дефолтный host/port/protocol).

Если нужно изменить ограничения манипулятора (например, `min_rot`, `max_dist`), делайте это в конфиге/контроллере и перезапускайте сервер.

---

## 5) API (кратко)

### Bootstrap/лампы
- `GET /api/bootstrap` — стартовые данные UI
- `POST /api/lamps` — добавить лампу
- `PUT /api/lamps/<lamp_name>` — изменить лампу
- `DELETE /api/lamps/<lamp_name>` — удалить лампу
- `POST /api/lamp/<lamp>/command/<command>` — команда лампе
- `POST /api/program/<lamp>/<name>` — запуск стандартной программы
- `POST /api/program/custom/<lamp>` — запуск JSON-программы
- `POST /api/program/phase/<lamp>` — запуск phase-table
- `POST /api/program/stop/<lamp>` — остановка программы

### Логи
- `GET /api/logs` — tail логов
- `POST /api/logs/debug/on`
- `POST /api/logs/debug/off`

### Манипулятор
- `GET /api/manipulator/config` — лимиты + дефолтная цель
- `POST /api/manipulator/command` — короткая команда
- `POST /api/manipulator/packet` — позиционный пакет

Пример `POST /api/manipulator/command`:
```json
{
  "command": "1",
  "host": "192.168.254.120",
  "port": 8888,
  "protocol": "udp"
}
```

Пример `POST /api/manipulator/packet`:
```json
{
  "angle": 20,
  "distance": 35,
  "marker": 1,
  "host": "192.168.254.120",
  "port": 8888,
  "protocol": "udp"
}
```

---

## 6) Форматы UDP-состояния ламп

Основной ожидаемый формат:
```text
leds: r: 0 b: 0 g: 0 y: 1
```

Резервный (legacy) формат:
```text
0010
```

---

## 7) Структура проекта

```text
.
├── web_server.py
├── requirements.txt
├── templates/
│   ├── dashboard.html
│   └── manipulator.html
├── static/
│   ├── style.css
│   ├── theme.js
│   ├── dashboard.js
│   └── manipulator.js
└── system/
    ├── config.py
    ├── logger.py
    ├── lamp_controller.py
    ├── lamp_monitor.py
    ├── manipulator_controller.py
    ├── persistence.py
    └── program_runner.py
```

---

## 8) Диагностика проблем

- **UI не обновляется:** проверьте, что Socket.IO подключен (статус в шапке).
- **Лампа offline:** проверьте IP/порт устройства и что устройство шлёт UDP-состояние.
- **Манипулятор не принимает команду:** проверьте `host/port/protocol` во вкладке `/manipulator`.
- **Нет DEBUG в логах:** включите DEBUG через кнопку на странице ламп.
- **Проблемы с правами на логи:** убедитесь, что каталог `logs/` доступен на запись.

---

## 9) Принципы, которые важно сохранять при доработке

- Не ломать API-контракт (особенно `/api/manipulator/*`).
- Логика ламп и манипулятора должна оставаться изолированной.
- Изменения в стилях для манипулятора — максимально scoped, чтобы не затронуть `/`.
- UI должен оставаться рабочим в темной и светлой теме.
