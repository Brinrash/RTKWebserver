import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DB_PATH = os.getenv("DB_PATH", "./manipulators.db")
NODE_RED_BASE_URL = os.getenv("NODE_RED_BASE_URL", "http://localhost:1880")
NODE_RED_TIMEOUT = float(os.getenv("NODE_RED_TIMEOUT", "5"))

app = FastAPI(
    title="Manipulator Control API",
    description="API для управления манипуляторами и проксирования команд в Node-RED.",
    version="1.0.0",
)


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, Any, None]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS manipulators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                model TEXT NOT NULL,
                node_red_endpoint TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                last_command TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


@app.on_event("startup")
def on_startup() -> None:
    init_db()


class ManipulatorCreate(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    model: str = Field(min_length=2, max_length=64)
    node_red_endpoint: str = Field(
        default="/manipulator/command",
        description="HTTP endpoint в Node-RED для отправки команд.",
    )


class ManipulatorUpdate(BaseModel):
    model: str | None = Field(default=None, min_length=2, max_length=64)
    status: str | None = Field(default=None, min_length=2, max_length=32)
    node_red_endpoint: str | None = None


class ManipulatorOut(BaseModel):
    id: int
    name: str
    model: str
    node_red_endpoint: str
    status: str
    last_command: str | None
    updated_at: str


class CommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/manipulators", response_model=list[ManipulatorOut])
def list_manipulators() -> list[ManipulatorOut]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM manipulators ORDER BY id").fetchall()
        return [ManipulatorOut(**dict(row)) for row in rows]


@app.post("/manipulators", response_model=ManipulatorOut, status_code=201)
def create_manipulator(item: ManipulatorCreate) -> ManipulatorOut:
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        try:
            cursor = conn.execute(
                """
                INSERT INTO manipulators (name, model, node_red_endpoint, status, updated_at)
                VALUES (?, ?, ?, 'idle', ?)
                """,
                (item.name, item.model, item.node_red_endpoint, now),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Manipulator with this name already exists") from exc

        row = conn.execute("SELECT * FROM manipulators WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return ManipulatorOut(**dict(row))


@app.get("/manipulators/{manipulator_id}", response_model=ManipulatorOut)
def get_manipulator(manipulator_id: int) -> ManipulatorOut:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM manipulators WHERE id = ?", (manipulator_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Manipulator not found")
        return ManipulatorOut(**dict(row))


@app.patch("/manipulators/{manipulator_id}", response_model=ManipulatorOut)
def update_manipulator(manipulator_id: int, item: ManipulatorUpdate) -> ManipulatorOut:
    updates = {k: v for k, v in item.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
    values = list(updates.values()) + [manipulator_id]

    with get_conn() as conn:
        cursor = conn.execute(f"UPDATE manipulators SET {set_clause} WHERE id = ?", values)
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Manipulator not found")

        row = conn.execute("SELECT * FROM manipulators WHERE id = ?", (manipulator_id,)).fetchone()
        return ManipulatorOut(**dict(row))


@app.delete("/manipulators/{manipulator_id}", status_code=204)
def delete_manipulator(manipulator_id: int) -> None:
    with get_conn() as conn:
        cursor = conn.execute("DELETE FROM manipulators WHERE id = ?", (manipulator_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Manipulator not found")


@app.post("/manipulators/{manipulator_id}/command")
def send_command(manipulator_id: int, request: CommandRequest) -> dict[str, Any]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM manipulators WHERE id = ?", (manipulator_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Manipulator not found")

        endpoint = row["node_red_endpoint"]
        url = f"{NODE_RED_BASE_URL.rstrip('/')}/{endpoint.lstrip('/')}"
        body = {
            "manipulator_id": manipulator_id,
            "name": row["name"],
            "model": row["model"],
            "command": request.command,
            "payload": request.payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    try:
        with httpx.Client(timeout=NODE_RED_TIMEOUT) as client:
            response = client.post(url, json=body)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Node-RED unavailable: {exc}") from exc

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE manipulators
            SET status = ?, last_command = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                "busy" if request.command.lower() not in {"stop", "reset"} else "idle",
                request.command,
                datetime.now(timezone.utc).isoformat(),
                manipulator_id,
            ),
        )
        conn.commit()

    response_data: Any
    try:
        response_data = response.json()
    except ValueError:
        response_data = {"raw": response.text}

    return {
        "sent_to": url,
        "node_red_status": response.status_code,
        "node_red_response": response_data,
    }
