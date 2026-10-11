"""KPI On Time Delivery (OTD) per V-Tech Trasporti.

Modulo AGGIUNTIVO e indipendente, sul modello di vtech_claims.py:
- importa il report OTM "Order Status Code & Reason Code" (un log di eventi,
  piu righe per ordine) e lo riduce a una riga per ordine;
- calcola l'esito con la stessa regola della dashboard IOD di Haleon;
- crea tabelle proprie nello stesso database del gestionale, senza toccare
  quelle esistenti.

Regola (identica a Haleon):
- partenza = SHIPPED DATE; consegna = primo evento "Delivered" (status 17);
- giorni di consegna = giorni lavorativi tra partenza (esclusa) e consegna
  (inclusa); sono esclusi sabato, domenica e le festivita' italiane;
- prenotata -> OK in automatico; altrimenti OK se giorni <= lead time, NO se
  oltre (ritardo = giorni - lead time);
- senza data di consegna -> SENZA ESITO (esclusa dal calcolo);
- RESA / SMARRITA / GIACENZA / ANNULLATA non entrano nell'OTD;
- % OTD = OK / (OK + NO).
L'esito si puo' forzare a mano ordine per ordine (tabella otd_overrides).
"""

from __future__ import annotations

import csv
import io
import re
import sqlite3
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from vtech_app import DB_PATH, DOWNLOADS_DIR, clean_text

OUTCOME_OK = "OK"
OUTCOME_NO = "NO"
OUTCOME_NO_STATUS = "SENZA ESITO"
FORCED_OUTCOMES = [
    OUTCOME_OK,
    OUTCOME_NO,
    "RESA",
    "SMARRITA",
    "GIACENZA",
    "ANNULLATA",
    OUTCOME_NO_STATUS,
]
# Esiti che non entrano nel calcolo dell'OTD (solo OK e NO contano).
NO_STATUS_ALERT_DAYS = 10

STATUS_DELIVERED = "17"
STATUS_POD = "3060"
STATUS_APPOINTMENT = "2520"
STATUS_NOT_DELIVERED = "76"
STATUS_RETURN = "602"
STATUS_ORDER = {"609": 1, "610": 2, "2520": 3, "611": 4, "76": 5, "602": 5, "17": 6, "3060": 7}

MONTH_NAMES = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
]

# ------------------------------------------------------------------ giorni


def easter_sunday(year: int) -> date:
    """Pasqua (algoritmo gregoriano anonimo)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


_HOLIDAY_CACHE: dict[int, frozenset[date]] = {}


def italian_holidays(year: int) -> frozenset[date]:
    """Festivita' nazionali italiane dell'anno (inclusa Pasquetta)."""
    cached = _HOLIDAY_CACHE.get(year)
    if cached is None:
        fixed = [(1, 1), (1, 6), (4, 25), (5, 1), (6, 2), (8, 15), (11, 1), (12, 8), (12, 25), (12, 26)]
        days = {date(year, month, day) for month, day in fixed}
        days.add(easter_sunday(year) + timedelta(days=1))
        cached = frozenset(days)
        _HOLIDAY_CACHE[year] = cached
    return cached


def is_working_day(day: date) -> bool:
    return day.weekday() < 5 and day not in italian_holidays(day.year)


def working_days_between(start: date, end: date) -> int:
    """Giorni lavorativi in (start, end]; 0 se end non e' dopo start."""
    count = 0
    day = start
    while day < end:
        day += timedelta(days=1)
        if is_working_day(day):
            count += 1
    return count


# ------------------------------------------------------------------- utils


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = clean_text(value)
    if not raw:
        return None
    for pattern in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:10], pattern).date()
        except ValueError:
            continue
    return None


def _iso(value: date | None) -> str:
    return value.isoformat() if value else ""


def _from_iso(value: Any) -> date | None:
    raw = clean_text(value)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _to_int(value: Any) -> int | None:
    raw = clean_text(value).replace(",", ".")
    if not raw:
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def _to_float(value: Any) -> float | None:
    raw = clean_text(value).replace(",", ".")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _norm_carrier(value: Any) -> str:
    return re.sub(r"\s+", " ", clean_text(value)).upper()


def _norm_province(value: Any) -> str:
    raw = clean_text(value).upper()
    return raw if raw else "*"


def _norm_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean_text(value).lower()).strip()


# --------------------------------------------------------------------- db


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_otd_db(db_path: Path = DB_PATH) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS otd_orders (
                order_id TEXT PRIMARY KEY,
                delivery_note TEXT,
                shipment_id TEXT,
                carrier TEXT,
                customer TEXT,
                dest_location TEXT,
                dest_city TEXT,
                dest_province TEXT,
                dest_postal TEXT,
                weight REAL,
                volume REAL,
                shipped_date TEXT,
                delivered_date TEXT,
                pod_date TEXT,
                last_status_code TEXT,
                last_status_desc TEXT,
                last_event_date TEXT,
                booked_otm INTEGER NOT NULL DEFAULT 0,
                otm_lead_time INTEGER,
                reasons TEXT,
                source_file TEXT,
                imported_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_otd_orders_shipped ON otd_orders(shipped_date);
            CREATE TABLE IF NOT EXISTS otd_overrides (
                order_id TEXT PRIMARY KEY,
                outcome TEXT,
                booked INTEGER,
                note TEXT,
                updated_by TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS otd_lead_times (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                carrier TEXT NOT NULL,
                province TEXT NOT NULL,
                days INTEGER NOT NULL,
                UNIQUE(carrier, province)
            );
            CREATE TABLE IF NOT EXISTS otd_booked_destinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE
            );
            """
        )


# ----------------------------------------------------------------- import

COLUMN_ALIASES = {
    "order_id": ["order id", "order", "ordine", "n ordine"],
    "delivery_note": ["delivery note"],
    "shipment_id": ["shipment id", "shipment"],
    "carrier": ["carrier", "vettore"],
    "customer": ["customer name", "customer", "cliente"],
    "dest_location": ["dest location", "destination location"],
    "dest_city": ["dest city", "destination city"],
    "dest_province": ["dest province", "destination province"],
    "dest_postal": ["dest postal code", "postal code"],
    "weight": ["weight", "peso"],
    "volume": ["volume"],
    "status_code": ["status code"],
    "status_desc": ["status desc"],
    "reason_code": ["reason code"],
    "reason_desc": ["reason desc"],
    "shipped_date": ["shipped date", "data partenza"],
    "event_date": ["event date"],
    "event_inserted": ["event inserted date"],
    "lead_time": ["lead time"],
}


def _map_columns(header: list[Any]) -> dict[str, int]:
    normalized = [_norm_header(value) for value in header]
    mapping: dict[str, int] = {}
    for key, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                mapping[key] = normalized.index(alias)
                break
    return mapping


def _read_event_rows(content: bytes) -> list[dict[str, Any]]:
    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows = sheet.iter_rows(values_only=True)
    mapping: dict[str, int] = {}
    events: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if not mapping:
            if index > 15:
                break
            candidate = _map_columns(list(row))
            if {"order_id", "status_code", "event_date"} <= candidate.keys():
                mapping = candidate
            continue
        if not any(cell not in (None, "") for cell in row):
            continue
        event = {key: (row[col] if col < len(row) else None) for key, col in mapping.items()}
        if clean_text(event.get("order_id")):
            events.append(event)
    workbook.close()
    if not mapping:
        raise ValueError(
            "File non riconosciuto: servono le colonne Order ID, STATUS CODE ed EVENT DATE "
            "(report OTM 'Order Status Code & Reason Code')."
        )
    return events


def _aggregate_orders(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        grouped[clean_text(event["order_id"])].append(event)

    orders: dict[str, dict[str, Any]] = {}
    for order_id, items in grouped.items():
        def sort_key(item: dict[str, Any]) -> tuple:
            return (
                parse_date(item.get("event_date")) or date.min,
                parse_date(item.get("event_inserted")) or date.min,
                STATUS_ORDER.get(clean_text(item.get("status_code")), 0),
            )

        ordered = sorted(items, key=sort_key)
        last = ordered[-1]
        first = ordered[0]

        def first_date(code: str) -> date | None:
            dates = [
                parse_date(item.get("event_date"))
                for item in items
                if clean_text(item.get("status_code")) == code
            ]
            dates = [value for value in dates if value]
            return min(dates) if dates else None

        shipped_dates = [parse_date(item.get("shipped_date")) for item in items]
        shipped_dates = [value for value in shipped_dates if value]
        reasons = []
        for item in ordered:
            code = clean_text(item.get("reason_code"))
            desc = clean_text(item.get("reason_desc"))
            if code and code.upper() != "NS" and desc and desc not in reasons:
                reasons.append(desc)
        lead_values = [_to_int(item.get("lead_time")) for item in items]
        lead_values = [value for value in lead_values if value is not None]
        orders[order_id] = {
            "order_id": order_id,
            "delivery_note": clean_text(last.get("delivery_note")),
            "shipment_id": clean_text(last.get("shipment_id")),
            "carrier": _norm_carrier(last.get("carrier")),
            "customer": clean_text(last.get("customer")),
            "dest_location": clean_text(first.get("dest_location")),
            "dest_city": clean_text(first.get("dest_city")),
            "dest_province": clean_text(first.get("dest_province")).upper(),
            "dest_postal": clean_text(first.get("dest_postal")),
            "weight": _to_float(first.get("weight")),
            "volume": _to_float(first.get("volume")),
            "shipped_date": _iso(min(shipped_dates) if shipped_dates else None),
            "delivered_date": _iso(first_date(STATUS_DELIVERED)),
            "pod_date": _iso(first_date(STATUS_POD)),
            "last_status_code": clean_text(last.get("status_code")),
            "last_status_desc": clean_text(last.get("status_desc")),
            "last_event_date": _iso(parse_date(last.get("event_date"))),
            "booked_otm": 1 if any(clean_text(i.get("status_code")) == STATUS_APPOINTMENT for i in items) else 0,
            "otm_lead_time": lead_values[-1] if lead_values else None,
            "reasons": " | ".join(reasons),
            "has_return": any(clean_text(i.get("status_code")) == STATUS_RETURN for i in items),
            "has_not_delivered": any(clean_text(i.get("status_code")) == STATUS_NOT_DELIVERED for i in items),
        }
    return orders


def import_otm_events(
    content: bytes,
    source_file: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Importa il report OTM eventi; riscrive gli ordini presenti nel file.

    Gli esiti forzati a mano (otd_overrides) non vengono mai toccati.
    """
    init_otd_db(db_path)
    events = _read_event_rows(content)
    orders = _aggregate_orders(events)
    if not orders:
        raise ValueError("Nessun ordine trovato nel file.")
    stamp = _now()
    with _connect(db_path) as conn:
        existing = {row["order_id"] for row in conn.execute("SELECT order_id FROM otd_orders")}
        for order in orders.values():
            conn.execute(
                """
                INSERT INTO otd_orders (
                    order_id, delivery_note, shipment_id, carrier, customer, dest_location,
                    dest_city, dest_province, dest_postal, weight, volume, shipped_date,
                    delivered_date, pod_date, last_status_code, last_status_desc,
                    last_event_date, booked_otm, otm_lead_time, reasons, source_file, imported_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(order_id) DO UPDATE SET
                    delivery_note=excluded.delivery_note, shipment_id=excluded.shipment_id,
                    carrier=excluded.carrier, customer=excluded.customer,
                    dest_location=excluded.dest_location, dest_city=excluded.dest_city,
                    dest_province=excluded.dest_province, dest_postal=excluded.dest_postal,
                    weight=excluded.weight, volume=excluded.volume,
                    shipped_date=excluded.shipped_date, delivered_date=excluded.delivered_date,
                    pod_date=excluded.pod_date, last_status_code=excluded.last_status_code,
                    last_status_desc=excluded.last_status_desc,
                    last_event_date=excluded.last_event_date, booked_otm=excluded.booked_otm,
                    otm_lead_time=excluded.otm_lead_time, reasons=excluded.reasons,
                    source_file=excluded.source_file, imported_at=excluded.imported_at
                """,
                (
                    order["order_id"], order["delivery_note"], order["shipment_id"],
                    order["carrier"], order["customer"], order["dest_location"],
                    order["dest_city"], order["dest_province"], order["dest_postal"],
                    order["weight"], order["volume"], order["shipped_date"],
                    order["delivered_date"], order["pod_date"], order["last_status_code"],
                    order["last_status_desc"], order["last_event_date"], order["booked_otm"],
                    order["otm_lead_time"], order["reasons"], clean_text(source_file), stamp,
                ),
            )
    new_count = sum(1 for order_id in orders if order_id not in existing)
    return {
        "events": len(events),
        "orders": len(orders),
        "new": new_count,
        "updated": len(orders) - new_count,
        "delivered": sum(1 for o in orders.values() if o["delivered_date"]),
        "booked": sum(1 for o in orders.values() if o["booked_otm"]),
        "file": clean_text(source_file),
    }


# ------------------------------------------------------------- lead times


def list_lead_times(db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    init_otd_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT id, carrier, province, days FROM otd_lead_times ORDER BY carrier, province").fetchall()
    return [dict(row) for row in rows]


def set_lead_time(carrier: Any, province: Any, days: Any, db_path: Path = DB_PATH) -> None:
    init_otd_db(db_path)
    carrier_key = _norm_carrier(carrier) or "*"
    province_key = _norm_province(province)
    value = _to_int(days)
    if value is None or value < 0 or value > 60:
        raise ValueError("Lead time non valido: indica i giorni lavorativi (0-60).")
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO otd_lead_times (carrier, province, days) VALUES (?,?,?)
            ON CONFLICT(carrier, province) DO UPDATE SET days=excluded.days
            """,
            (carrier_key, province_key, value),
        )


def delete_lead_time(lead_time_id: int, db_path: Path = DB_PATH) -> None:
    init_otd_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM otd_lead_times WHERE id = ?", (lead_time_id,))


def import_lead_times(content: bytes, filename: str, db_path: Path = DB_PATH) -> dict[str, Any]:
    """Carica i lead time da Excel/CSV: colonne Vettore, Provincia (facoltativa), Lead time."""
    init_otd_db(db_path)
    rows: list[list[Any]]
    if clean_text(filename).lower().endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        sample = text[:2048]
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
        rows = [list(row) for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    else:
        workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        rows = [list(row) for row in workbook.active.iter_rows(values_only=True)]
        workbook.close()
    header_index = None
    mapping: dict[str, int] = {}
    for index, row in enumerate(rows[:15]):
        normalized = [_norm_header(value) for value in row]
        carrier_col = next((normalized.index(a) for a in ("vettore", "carrier") if a in normalized), None)
        days_col = next((normalized.index(a) for a in ("lead time", "leadtime", "giorni", "days") if a in normalized), None)
        if carrier_col is not None and days_col is not None:
            province_col = next((normalized.index(a) for a in ("provincia", "province", "prov") if a in normalized), None)
            mapping = {"carrier": carrier_col, "days": days_col}
            if province_col is not None:
                mapping["province"] = province_col
            header_index = index
            break
    if header_index is None:
        raise ValueError("Servono le colonne Vettore e Lead time (Provincia facoltativa).")
    saved = 0
    skipped = 0
    for row in rows[header_index + 1:]:
        def cell(key: str) -> Any:
            col = mapping.get(key)
            return row[col] if col is not None and col < len(row) else None

        if not clean_text(cell("carrier")) and not clean_text(cell("days")):
            continue
        try:
            set_lead_time(cell("carrier"), cell("province"), cell("days"), db_path)
            saved += 1
        except ValueError:
            skipped += 1
    return {"saved": saved, "skipped": skipped}


def list_booked_destinations(db_path: Path = DB_PATH) -> list[dict[str, Any]]:
    init_otd_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT id, pattern FROM otd_booked_destinations ORDER BY pattern").fetchall()
    return [dict(row) for row in rows]


def add_booked_destination(pattern: Any, db_path: Path = DB_PATH) -> None:
    value = clean_text(pattern).upper()
    if len(value) < 3:
        raise ValueError("Indica almeno 3 caratteri del nome destinatario.")
    init_otd_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("INSERT OR IGNORE INTO otd_booked_destinations (pattern) VALUES (?)", (value,))


def delete_booked_destination(destination_id: int, db_path: Path = DB_PATH) -> None:
    init_otd_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM otd_booked_destinations WHERE id = ?", (destination_id,))


# -------------------------------------------------------------- overrides


def set_override(
    order_ids: list[Any],
    outcome: Any = None,
    booked: Any = None,
    note: Any = "",
    author: str = "",
    db_path: Path = DB_PATH,
) -> int:
    """Forza esito e/o prenotazione. outcome="" e booked=None ripristinano l'automatico."""
    init_otd_db(db_path)
    ids = [clean_text(value) for value in order_ids if clean_text(value)]
    if not ids:
        raise ValueError("Seleziona almeno un ordine.")
    outcome_value = clean_text(outcome).upper()
    if outcome_value and outcome_value not in FORCED_OUTCOMES:
        raise ValueError(f"Esito non valido: {outcome_value}.")
    if booked is None or booked == "":
        booked_value = None
    else:
        booked_value = 1 if booked in (True, 1, "1", "true", "SI", "si") else 0
    with _connect(db_path) as conn:
        for order_id in ids:
            if not outcome_value and booked_value is None:
                conn.execute("DELETE FROM otd_overrides WHERE order_id = ?", (order_id,))
                continue
            conn.execute(
                """
                INSERT INTO otd_overrides (order_id, outcome, booked, note, updated_by, updated_at)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(order_id) DO UPDATE SET
                    outcome=excluded.outcome, booked=excluded.booked, note=excluded.note,
                    updated_by=excluded.updated_by, updated_at=excluded.updated_at
                """,
                (order_id, outcome_value or None, booked_value, clean_text(note), author, _now()),
            )
    return len(ids)


# ---------------------------------------------------------------- calcolo


def _gestionale_unload_orders(db_path: Path) -> set[str]:
    """Ordini del gestionale con scarico prenotato (shipments.unload_date)."""
    booked: set[str] = set()
    try:
        with _connect(db_path) as conn:
            rows = conn.execute(
                "SELECT orders_text FROM shipments WHERE COALESCE(unload_date, '') <> ''"
            ).fetchall()
    except sqlite3.Error:
        return booked
    for row in rows:
        booked.update(re.findall(r"\d{5,}", clean_text(row["orders_text"])))
    return booked


def _lead_time_lookup(lead_rows: list[dict[str, Any]]):
    table = {(row["carrier"], row["province"]): int(row["days"]) for row in lead_rows}

    def lookup(carrier: str, province: str) -> int | None:
        for key in ((carrier, province), (carrier, "*"), ("*", province), ("*", "*")):
            if key in table:
                return table[key]
        return None

    return lookup


def evaluate_order(
    order: dict[str, Any],
    lead_time: int | None,
    booked: bool,
    forced_outcome: str,
    today: date,
) -> dict[str, Any]:
    """Esito di un ordine. Restituisce outcome, auto, days, delay, noStatus10."""
    shipped = _from_iso(order.get("shipped_date"))
    delivered = _from_iso(order.get("delivered_date")) or _from_iso(order.get("pod_date"))
    days = working_days_between(shipped, delivered) if shipped and delivered else None
    delay = None
    if days is not None and lead_time is not None and days > lead_time:
        delay = days - lead_time

    if delivered and shipped:
        if booked:
            auto = OUTCOME_OK
        elif lead_time is None:
            auto = OUTCOME_NO_STATUS
        else:
            auto = OUTCOME_OK if days <= lead_time else OUTCOME_NO
    elif order.get("has_return") or clean_text(order.get("last_status_code")) == STATUS_RETURN:
        auto = "RESA"
    elif clean_text(order.get("last_status_code")) == STATUS_NOT_DELIVERED:
        auto = "NON CONSEGNATA"
    else:
        auto = OUTCOME_NO_STATUS

    outcome = forced_outcome or auto
    if outcome == OUTCOME_NO and delay is None and days is not None and lead_time is not None:
        delay = max(days - lead_time, 0)
    no_status_alert = bool(
        outcome == OUTCOME_NO_STATUS
        and not booked
        and shipped
        and working_days_between(shipped, today) > NO_STATUS_ALERT_DAYS
    )
    return {
        "outcome": outcome,
        "auto": auto,
        "days": days,
        "delay": delay if outcome == OUTCOME_NO else None,
        "noStatus10": no_status_alert,
    }


def compute_rows(db_path: Path = DB_PATH, today: date | None = None) -> list[dict[str, Any]]:
    init_otd_db(db_path)
    today = today or date.today()
    with _connect(db_path) as conn:
        orders = [dict(row) for row in conn.execute("SELECT * FROM otd_orders ORDER BY shipped_date, order_id")]
        overrides = {row["order_id"]: dict(row) for row in conn.execute("SELECT * FROM otd_overrides")}
    lookup = _lead_time_lookup(list_lead_times(db_path))
    patterns = [row["pattern"] for row in list_booked_destinations(db_path)]
    gestionale_booked = _gestionale_unload_orders(db_path)

    rows: list[dict[str, Any]] = []
    for order in orders:
        override = overrides.get(order["order_id"]) or {}
        lead = lookup(order["carrier"], order["dest_province"] or "*")
        lead_source = "tabella" if lead is not None else ""
        if lead is None and order.get("otm_lead_time") is not None:
            lead, lead_source = int(order["otm_lead_time"]), "OTM"

        booked_source = ""
        if override.get("booked") is not None:
            booked = bool(override["booked"])
            booked_source = "manuale" if booked else ""
        else:
            booked = False
            destination = clean_text(order.get("dest_location")).upper()
            if order.get("booked_otm"):
                booked, booked_source = True, "OTM"
            elif any(pattern in destination for pattern in patterns):
                booked, booked_source = True, "elenco"
            elif order["order_id"] in gestionale_booked:
                booked, booked_source = True, "gestionale"

        forced = clean_text(override.get("outcome"))
        result = evaluate_order(order, lead, booked, forced, today)
        shipped = clean_text(order.get("shipped_date"))
        rows.append({
            "id": order["order_id"],
            "dn": order["delivery_note"],
            "ship": order["shipment_id"],
            "carrier": order["carrier"],
            "customer": order["customer"],
            "dest": order["dest_location"],
            "city": order["dest_city"],
            "prov": order["dest_province"],
            "weight": order["weight"],
            "volume": order["volume"],
            "shipped": shipped,
            "month": shipped[:7],
            "delivered": clean_text(order.get("delivered_date")) or clean_text(order.get("pod_date")),
            "lead": lead,
            "leadSource": lead_source,
            "booked": booked,
            "bookedSource": booked_source,
            "lastStatus": order["last_status_desc"],
            "reasons": order["reasons"],
            "forced": bool(forced),
            "bookedForced": override.get("booked") is not None,
            "note": clean_text(override.get("note")),
            **result,
        })
    return rows


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = defaultdict(int)
    delay_sum = 0
    for row in rows:
        counts[row["outcome"]] += 1
        if row["outcome"] == OUTCOME_NO and row["delay"]:
            delay_sum += int(row["delay"])
    ok, no = counts[OUTCOME_OK], counts[OUTCOME_NO]
    return {
        "total": len(rows),
        "ok": ok,
        "no": no,
        "noStatus": counts[OUTCOME_NO_STATUS],
        "other": len(rows) - ok - no - counts[OUTCOME_NO_STATUS],
        "otd": (ok / (ok + no)) if (ok + no) else None,
        "avgDelay": (delay_sum / no) if no else 0,
        "noStatus10": sum(1 for row in rows if row["noStatus10"]),
        "booked": sum(1 for row in rows if row["booked"]),
        "counts": dict(counts),
    }


def otd_payload(db_path: Path = DB_PATH) -> dict[str, Any]:
    rows = compute_rows(db_path)
    return {
        "rows": rows,
        "summary": summarize(rows),
        "leadTimes": list_lead_times(db_path),
        "bookedDestinations": list_booked_destinations(db_path),
        "outcomes": FORCED_OUTCOMES,
    }


# ----------------------------------------------------------------- export

TITLE_FONT = Font(bold=True, size=14, color="0F2D46")
HEADER_FILL = PatternFill("solid", fgColor="0F2D46")
HEADER_FONT = Font(bold=True, color="FFFFFF")
THIN = Side(style="thin", color="D5DEE8")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
NO_FILL = PatternFill("solid", fgColor="FDE2E2")
WARN_FILL = PatternFill("solid", fgColor="FEF3C7")


def _month_label(month: str) -> str:
    try:
        year, number = month.split("-")
        return f"{MONTH_NAMES[int(number) - 1]} {year}"
    except (ValueError, IndexError):
        return month or "-"


def _write_table(sheet, start_row: int, headers: list[str], data: list[list[Any]], widths: list[int] | None = None) -> int:
    for col, header in enumerate(headers, start=1):
        cell = sheet.cell(row=start_row, column=col, value=header)
        cell.fill, cell.font, cell.border = HEADER_FILL, HEADER_FONT, BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for offset, values in enumerate(data, start=1):
        for col, value in enumerate(values, start=1):
            cell = sheet.cell(row=start_row + offset, column=col, value=value)
            cell.border = BORDER
    if widths:
        for col, width in enumerate(widths, start=1):
            sheet.column_dimensions[get_column_letter(col)].width = width
    return start_row + len(data)


def _group_summary(rows: list[dict[str, Any]], key: str, label=lambda v: v) -> list[list[Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[row[key] or "-"].append(row)
    result = []
    for name in sorted(groups):
        s = summarize(groups[name])
        result.append([label(name), s["total"], s["ok"], s["no"], s["noStatus"], s["other"], s["otd"], round(s["avgDelay"], 2)])
    return result


def export_otd_report(
    db_path: Path = DB_PATH,
    downloads_dir: Path = DOWNLOADS_DIR,
    month: str = "",
    carrier: str = "",
) -> Path:
    rows = compute_rows(db_path)
    month = clean_text(month)
    carrier = _norm_carrier(carrier)
    if month:
        rows = [row for row in rows if row["month"] == month]
    if carrier:
        rows = [row for row in rows if row["carrier"] == carrier]
    if not rows:
        raise ValueError("Nessun ordine da esportare con questi filtri.")

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Riepilogo"
    sheet["A1"] = "V-Tech Trasporti - On Time Delivery"
    sheet["A1"].font = TITLE_FONT
    scope = []
    if month:
        scope.append(_month_label(month))
    if carrier:
        scope.append(carrier)
    sheet["A2"] = (" - ".join(scope) if scope else "Tutti i mesi, tutti i vettori") + f" - generato il {datetime.now():%d/%m/%Y %H:%M}"
    total = summarize(rows)
    headers = ["", "Ordini", "OK", "NO", "Senza esito", "Altri esiti", "% OTD", "Ritardo medio gg"]
    widths = [26, 11, 9, 9, 13, 12, 9, 17]
    end = _write_table(
        sheet, 4, headers,
        [["TOTALE", total["total"], total["ok"], total["no"], total["noStatus"], total["other"], total["otd"], round(total["avgDelay"], 2)]],
        widths,
    )
    sheet.cell(row=end + 2, column=1, value="Per mese").font = Font(bold=True)
    end = _write_table(sheet, end + 3, ["Mese"] + headers[1:], _group_summary(rows, "month", _month_label))
    sheet.cell(row=end + 2, column=1, value="Per vettore").font = Font(bold=True)
    end = _write_table(sheet, end + 3, ["Vettore"] + headers[1:], _group_summary(rows, "carrier"))
    for row_cells in sheet.iter_rows(min_row=5, max_row=end):
        cell = row_cells[6] if len(row_cells) > 6 else None
        if cell is not None and isinstance(cell.value, float) and cell.value <= 1:
            cell.number_format = "0.0%"
    sheet.cell(row=end + 2, column=1, value=(
        "Regola: giorni lavorativi (esclusi sabato, domenica e festivita' italiane) dalla partenza alla consegna; "
        "prenotata = OK; altrimenti OK se giorni <= lead time. % OTD = OK / (OK + NO)."
    )).alignment = Alignment(wrap_text=False)

    detail_headers = [
        "Ordine", "Delivery Note", "Shipment", "Vettore", "Destinatario", "Citta", "Prov", "Partenza",
        "Consegna", "Giorni lav.", "Lead time", "Origine lead time", "Prenotata", "Esito", "Esito forzato",
        "Ritardo gg", "Ultimo stato", "Motivi", "Note",
    ]
    detail_widths = [13, 13, 18, 12, 38, 20, 6, 12, 12, 10, 10, 14, 11, 13, 12, 10, 24, 40, 30]

    def detail_rows(items: list[dict[str, Any]]) -> list[list[Any]]:
        return [[
            row["id"], row["dn"], row["ship"], row["carrier"], row["dest"], row["city"], row["prov"],
            _from_iso(row["shipped"]), _from_iso(row["delivered"]), row["days"], row["lead"], row["leadSource"],
            "SI" if row["booked"] else "NO", row["outcome"], "SI" if row["forced"] else "",
            row["delay"], row["lastStatus"], row["reasons"], row["note"],
        ] for row in items]

    def add_detail_sheet(title: str, items: list[dict[str, Any]]) -> None:
        target = workbook.create_sheet(title)
        data = detail_rows(items)
        _write_table(target, 1, detail_headers, data, detail_widths)
        target.freeze_panes = "A2"
        target.auto_filter.ref = f"A1:{get_column_letter(len(detail_headers))}{max(len(data) + 1, 2)}"
        for index, item in enumerate(items, start=2):
            for col in (8, 9):
                target.cell(row=index, column=col).number_format = "DD/MM/YYYY"
            fill = NO_FILL if item["outcome"] == OUTCOME_NO else (WARN_FILL if item["noStatus10"] else None)
            if fill:
                for col in range(1, len(detail_headers) + 1):
                    target.cell(row=index, column=col).fill = fill

    add_detail_sheet("Dettaglio", rows)
    add_detail_sheet("Ritardi (NO)", [row for row in rows if row["outcome"] == OUTCOME_NO])
    add_detail_sheet("Senza esito oltre 10 gg", [row for row in rows if row["noStatus10"]])

    downloads_dir.mkdir(parents=True, exist_ok=True)
    suffix = "_".join(part for part in [month, carrier] if part) or "tutti"
    output = downloads_dir / f"vtech_otd_{suffix}_{datetime.now():%Y%m%d_%H%M%S}.xlsx"
    workbook.save(output)
    return output
