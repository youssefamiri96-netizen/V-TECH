from __future__ import annotations

import argparse
import csv
import base64
import hashlib
import html as html_lib
import hmac
import json
import mimetypes
import os
import platform
import re
import secrets
import socket
import subprocess
import threading
import uuid
import webbrowser
from datetime import date, datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

from vtech_app import (
    AVAILABLE_CARRIERS,
    COLUMN_TITLES,
    CUSTOMER_REGISTRY_PATH,
    DEFAULT_ACTIVE_PATH,
    DEFAULT_BRT_PATH,
    DEFAULT_VTECH_PATH,
    DISPLAY_COLUMNS,
    GROUPAGE_MAIL_EXCLUDED_COLUMNS,
    GROUPAGE_MAIL_ONLY_COLUMNS,
    OUTPUT_DIR,
    DATA_DIR,
    DOWNLOADS_DIR,
    STATUS_CONFIRMED,
    STATUS_DEPARTED,
    STATUS_DELIVERED,
    STATUS_PLANNED,
    billing_reference_date,
    ceil_pallets,
    clean_text,
    count_deleted_shipments,
    delete_shipments_permanently,
    display_value,
    export_active_billing_report,
    export_passive_billing_by_carrier,
    find_outbound_reports,
    format_number,
    is_imported_file_current,
    load_deleted_shipments,
    load_monthly_fuel_settings,
    load_settings,
    load_shipments_from_db,
    mark_confirmed,
    mark_delivered,
    mark_departed,
    mark_planned,
    mark_unplanned,
    purge_deleted_shipments,
    restore_deleted_shipments,
    run_import,
    save_settings,
    save_monthly_fuel_settings,
    set_active_urgent,
    serialize,
    set_manual_carrier,
    set_manual_freight_code,
    set_manual_pallets,
    set_manual_passive_cost,
    set_manual_service_level,
    set_required_delivery_date,
    set_unload_booking,
    set_unload_date,
    to_float,
)

APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
AUTH_USERS_PATH = DATA_DIR / "users.json"
AUTH_TEMP_PASSWORDS_PATH = DATA_DIR / "accessi_temporanei.txt"
UPLOAD_DIR = DATA_DIR / "uploads"
SESSION_COOKIE_NAME = "vtech_session"
SESSION_LOCK = threading.Lock()
SESSIONS: dict[str, dict[str, Any]] = {}
GROUPAGE_MAIL_PENDING_PATH = DATA_DIR / "groupage_mail_pending.json"
FTL_MAIL_COLUMNS = [
    "Shipment",
    "Orders",
    "Provincia",
    "Route to Customer",
    "Route To Address",
    "Service Level",
    "Carrier Scelto",
    "Freight Code",
    "Prenotazione Scarico",
    "Booking Scarico",
    "Note Text",
    "Late Ship Date",
    "Early Delivery Date",
    "Data Consegna Tassativa",
    "Theoretical Pallets",
    "Pallet Fatturati",
    "Grand Total Shipment Ftp Wgt Kg",
    "Grand Total Shipment Ftp Vol m3",
]
DOWNLOAD_SCAN_SECONDS = 15
SCAN_LOCK = threading.Lock()

FULL_ACCESS_ROLES = {"admin", "backup", "operator"}
BILLING_ACCESS_ROLES = FULL_ACCESS_ROLES | {"billing"}
USER_ROLES = {
    "admin": "Admin",
    "backup": "Backup operativo",
    "operator": "Operativo",
    "billing": "Fatturazione",
}
PUBLIC_POST_PATHS = {"/api/login"}
PUBLIC_GET_PATHS = {"/login.html"}
ADMIN_POST_PATHS = {"/api/users"}
BILLING_POST_PATHS = {
    "/api/passive-export",
    "/api/active-export",
    "/api/fuel-settings",
    "/api/open-path",
}
FULL_POST_PATHS = {
    "/api/import",
    "/api/upload-file",
    "/api/groupage-mail",
    "/api/ftl-mail",
    "/api/scan-downloads",
    "/api/action",
}
UPLOAD_SETTINGS_KEYS = {
    "report": "vtech_path",
    "active": "active_rates_path",
    "brt": "brt_passive_path",
}
UPLOAD_EXTENSIONS = {
    "report": {".xlsx", ".xlsm", ".xls"},
    "active": {".xlsx", ".xlsm", ".xls"},
    "brt": {".pdf"},
}


def cloud_mode_enabled() -> bool:
    return clean_env_flag(os.environ.get("VTECH_CLOUD_MODE")) or bool(
        os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RAILWAY_SERVICE_NAME")
    )


def auth_disabled() -> bool:
    return clean_env_flag(os.environ.get("VTECH_AUTH_DISABLED"))


def local_admin_user() -> dict[str, str]:
    return {
        "username": "locale",
        "displayName": "Accesso locale",
        "role": "admin",
    }


def clean_env_flag(value: Any) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "si", "on"}


def download_url_for_path(path: Path | str | None) -> str:
    if not path:
        return ""
    return f"/api/download?path={quote(str(path), safe='')}"


def is_allowed_download_path(path: Path) -> bool:
    allowed_roots = [
        OUTPUT_DIR.resolve(),
        DOWNLOADS_DIR.resolve(),
        DATA_DIR.resolve(),
    ]
    return any(path == root or root in path.parents for root in allowed_roots)


def safe_upload_filename(filename: Any, fallback: str) -> str:
    name = Path(clean_text(filename) or fallback).name
    cleaned = re.sub(r"[^A-Za-z0-9_. ()&+-]+", "_", name).strip(" ._")
    return cleaned or fallback


def decode_upload_base64(value: Any) -> bytes:
    text = clean_text(value)
    if "," in text and text.lower().startswith("data:"):
        text = text.split(",", 1)[1]
    if not text:
        raise ValueError("File non ricevuto.")
    try:
        return base64.b64decode(text, validate=True)
    except Exception as exc:
        raise ValueError("File non valido o upload interrotto.") from exc


def is_brt_groupage(row: dict[str, Any]) -> bool:
    return clean_text(row.get("Tipo Servizio")) == "Groupage - BRT LTL"


def is_verify_wave(row: dict[str, Any]) -> bool:
    wave = clean_text(row.get("Wave")).upper()
    normalized = re.sub(r"[^A-Z0-9]+", " ", wave)
    return "DA VERIFICARE" in normalized or normalized.strip() in {"VERIFICARE", "DA VERIFICA"}


def date_key_from_value(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    for pattern in (r"^(\d{4})-(\d{2})-(\d{2})", r"^(\d{1,2})/(\d{1,2})/(\d{2,4})"):
        match = re.match(pattern, text)
        if not match:
            continue
        if pattern.startswith("^(\\d{4})"):
            year, month, day = match.groups()
        else:
            day, month, year = match.groups()
            if len(year) == 2:
                year = f"20{year}"
        try:
            return date(int(year), int(month), int(day)).strftime("%Y-%m-%d")
        except ValueError:
            return ""
    return ""


def report_info(settings: dict[str, Any]) -> dict[str, str]:
    path_text = clean_text(settings.get("vtech_path"))
    if not path_text:
        return {"name": "", "path": "", "updatedAt": ""}
    path = Path(path_text)
    updated_at = ""
    if path.exists():
        updated_at = datetime.fromtimestamp(path.stat().st_mtime).strftime("%d/%m/%Y %H:%M")
    return {"name": path.name, "path": path_text, "updatedAt": updated_at}


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 180_000)
    salt_text = base64.b64encode(salt).decode("ascii")
    digest_text = base64.b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256$180000${salt_text}${digest_text}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, expected_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_text.encode("ascii"))
        expected = base64.b64decode(expected_text.encode("ascii"))
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations_text))
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def ensure_auth_users() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    defaults = [
        ("youssef", "admin", "Youssef", "VTECH_ADMIN_PASSWORD"),
        ("backup", "backup", "Backup operativo", "VTECH_BACKUP_PASSWORD"),
        ("fatturazione", "billing", "Fatturazione", "VTECH_BILLING_PASSWORD"),
    ]
    users: dict[str, Any] = {}
    if AUTH_USERS_PATH.exists():
        try:
            payload = json.loads(AUTH_USERS_PATH.read_text(encoding="utf-8"))
            if isinstance(payload.get("users"), dict):
                users = payload["users"]
        except (OSError, json.JSONDecodeError):
            users = {}

    credentials: list[str] = [
        "ACCESSI TEMPORANEI V-TECH",
        "Cambia questi valori appena vuoi creare password definitive.",
        "",
    ]
    changed = not AUTH_USERS_PATH.exists()
    for username, role, display_name, env_name in defaults:
        env_password = clean_text(os.environ.get(env_name))
        password = env_password or secrets.token_urlsafe(10)
        user = users.get(username) if isinstance(users.get(username), dict) else {}
        if not user:
            user = {}
            users[username] = user
            changed = True
        if clean_text(user.get("displayName")) != display_name:
            user["displayName"] = display_name
            changed = True
        if clean_text(user.get("role")) != role:
            user["role"] = role
            changed = True
        if env_password or not clean_text(user.get("passwordHash")):
            user["passwordHash"] = password_hash(password)
            changed = True
        credentials.append(f"{display_name} ({role})")
        credentials.append(f"utente: {username}")
        credentials.append(f"password: {password if env_password or not AUTH_USERS_PATH.exists() else '(gia salvata in users.json)'}")
        credentials.append("")

    if changed:
        AUTH_USERS_PATH.write_text(json.dumps({"users": users}, indent=2, ensure_ascii=False), encoding="utf-8")
        AUTH_TEMP_PASSWORDS_PATH.write_text("\n".join(credentials), encoding="utf-8")


def load_auth_users() -> dict[str, Any]:
    ensure_auth_users()
    try:
        payload = json.loads(AUTH_USERS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    users = payload.get("users")
    return users if isinstance(users, dict) else {}


def safe_user_payload(username: str, user: dict[str, Any]) -> dict[str, str]:
    return {
        "username": username,
        "displayName": clean_text(user.get("displayName")) or username,
        "role": clean_text(user.get("role")) or "admin",
    }


def authenticate_user(username: str, password: str) -> dict[str, str] | None:
    users = load_auth_users()
    user = users.get(clean_text(username))
    if not isinstance(user, dict):
        return None
    if not verify_password(password, clean_text(user.get("passwordHash"))):
        return None
    return safe_user_payload(clean_text(username), user)


def create_session(user: dict[str, str]) -> str:
    token = secrets.token_urlsafe(32)
    with SESSION_LOCK:
        SESSIONS[token] = {
            "user": user,
            "createdAt": datetime.now().isoformat(timespec="seconds"),
        }
    return token


def parse_cookies(header: str | None) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in (header or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key.strip()] = value.strip()
    return cookies


def session_user_from_cookie(cookie_header: str | None) -> dict[str, str] | None:
    token = parse_cookies(cookie_header).get(SESSION_COOKIE_NAME)
    if not token:
        return None
    with SESSION_LOCK:
        session = SESSIONS.get(token)
    if not isinstance(session, dict):
        return None
    user = session.get("user")
    return user if isinstance(user, dict) else None


def destroy_session(cookie_header: str | None) -> None:
    token = parse_cookies(cookie_header).get(SESSION_COOKIE_NAME)
    if not token:
        return
    with SESSION_LOCK:
        SESSIONS.pop(token, None)


def has_full_access(user: dict[str, str] | None) -> bool:
    return clean_text((user or {}).get("role")) in FULL_ACCESS_ROLES


def has_billing_access(user: dict[str, str] | None) -> bool:
    return clean_text((user or {}).get("role")) in BILLING_ACCESS_ROLES


def has_admin_access(user: dict[str, str] | None) -> bool:
    return clean_text((user or {}).get("role")) == "admin"


def list_auth_users_payload() -> list[dict[str, str]]:
    users = load_auth_users()
    payload: list[dict[str, str]] = []
    for username, user in sorted(users.items()):
        if not isinstance(user, dict):
            continue
        role = clean_text(user.get("role")) or "operator"
        payload.append({
            "username": clean_text(username),
            "displayName": clean_text(user.get("displayName")) or clean_text(username),
            "role": role,
            "roleLabel": USER_ROLES.get(role, role),
        })
    return payload


def save_auth_users_payload(users: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_USERS_PATH.write_text(json.dumps({"users": users}, indent=2, ensure_ascii=False), encoding="utf-8")


def row_payload(row: dict[str, Any]) -> dict[str, Any]:
    display_columns = list(
        dict.fromkeys(
            DISPLAY_COLUMNS
            + [
                "Costo Passivo Base BRT",
                "Extra Attivi Totale",
                "Extra Attivi Applicati",
                "Costo Passivo Manuale",
                "Tariffa Attiva Applicata",
                "Tariffa Passiva Applicata",
                "Extra BRT Applicati",
                "Esito Margine",
                "SLA Contratto",
                "Preparazione SLA h",
                "Transit SLA h",
                "Tipo Transit SLA",
                "Data Ship Minima SLA",
                "Prima Consegna SLA",
                "Data Partenza",
                "Data Partenza Wave",
                "Vettore Wave",
                "Tipo Wave",
                "Freight Code Manuale",
                "Data Consegna Tassativa",
                "Early Delivery Date Originale",
                "Data Scarico Prenotato",
                "Ora Scarico Prenotato",
                "Riferimento Booking Scarico",
                "Booking Scarico",
                "Data Consegna",
                "XML Consegna",
                "Data Eliminazione",
                "Dettaglio SLA",
                "Secondo Vettore",
                "Terzo Vettore",
            ]
        )
    )
    return {
        "raw": {key: serialize(value) for key, value in row.items()},
        "display": {column: display_value(row, column) for column in display_columns},
        "shipment": clean_text(row.get("Shipment")),
        "status": clean_text(row.get("Stato")),
        "serviceType": clean_text(row.get("Tipo Servizio")),
        "isGroupage": is_brt_groupage(row),
    }


def load_gdo_customer_records() -> list[dict[str, str]]:
    path = DATA_DIR / "gdo_customers.csv"
    if not path.exists():
        return []
    columns = [
        "Codice Cliente",
        "Ship To Location",
        "Ragione Sociale",
        "Categoria Cliente",
        "Indirizzo Consegna",
        "Shipping Information",
        "Note Scarico",
        "GDO",
    ]
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        rows = []
        for row in reader:
            rows.append({column: clean_text(row.get(column)) for column in columns})
    return rows


def load_customer_registry_records() -> list[dict[str, str]]:
    path = CUSTOMER_REGISTRY_PATH
    if not path.exists():
        return load_gdo_customer_records()
    columns = [
        "Codice Cliente",
        "Ship To Location",
        "Ragione Sociale",
        "Indirizzo Consegna",
        "Responsabile Scarico",
        "Mail",
        "Telefono",
        "Shipping Information",
        "Consegna In Logistica",
        "GDO",
        "Note Scarico",
    ]
    with path.open("r", newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        return [
            {column: clean_text(row.get(column)) for column in columns}
            for row in reader
            if clean_text(row.get("Ragione Sociale")) or clean_text(row.get("Indirizzo Consegna"))
        ]


def grouped_shipments(user: dict[str, str] | None = None) -> dict[str, Any]:
    rows = load_shipments_from_db()
    deleted_rows = load_deleted_shipments()
    settings = load_settings()
    deleted_count = count_deleted_shipments()
    open_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) not in {STATUS_PLANNED, STATUS_DEPARTED, STATUS_CONFIRMED, STATUS_DELIVERED}
    ]
    verify_rows = [row for row in open_rows if is_verify_wave(row)]
    verify_shipments = {clean_text(row.get("Shipment")) for row in verify_rows}
    open_planning_rows = [
        row for row in open_rows
        if clean_text(row.get("Shipment")) not in verify_shipments
    ]
    planned_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) == STATUS_PLANNED
    ]
    departed_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) == STATUS_DEPARTED
    ]
    delivered_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) == STATUS_DELIVERED
    ]
    confirmed_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) == STATUS_CONFIRMED and not is_brt_groupage(row)
    ]
    open_groupage = [row for row in open_planning_rows if is_brt_groupage(row)]
    open_direct = [row for row in open_planning_rows if not is_brt_groupage(row)]
    planned_groupage = [row for row in planned_rows if is_brt_groupage(row)]
    planned_customer = [row for row in planned_rows if not is_brt_groupage(row)]
    today_key = date.today().strftime("%Y-%m-%d")
    unload_today_rows = [
        row for row in confirmed_rows
        if date_key_from_value(row.get("Data Scarico Prenotato")) == today_key
    ]
    sla_breach_rows = [
        row for row in rows
        if "NON RISPETTATO" in clean_text(row.get("SLA Contratto")).upper()
        and "BKV" in clean_text(row.get("Freight Code")).upper()
        and clean_text(row.get("Stato")) != STATUS_DELIVERED
    ]
    current_month = date.today().strftime("%Y-%m")
    current_month_margin = sum(
        to_float(row.get("Margine")) or 0
        for row in rows
        if (ref_date := billing_reference_date(row)) and ref_date.strftime("%Y-%m") == current_month
    )
    total_margin = sum(
        to_float(row.get("Margine")) or 0
        for row in rows
        if to_float(row.get("Margine")) is not None
    )
    margin_text = f"EUR {format_number(total_margin)}"
    columns = [
        column
        for column in DISPLAY_COLUMNS
        if column not in {"Costo Attivo", "Costo Passivo", "Extra BRT Totale", "Margine", "Miglior Vettore"}
    ]
    return {
        "columns": [{"key": column, "title": COLUMN_TITLES.get(column, column)} for column in columns],
        "billingColumns": [
            {"key": column, "title": COLUMN_TITLES.get(column, column)}
            for column in DISPLAY_COLUMNS
            if column not in GROUPAGE_MAIL_EXCLUDED_COLUMNS
        ],
        "carriers": AVAILABLE_CARRIERS,
        "gdoCustomers": load_gdo_customer_records(),
        "customers": load_customer_registry_records(),
        "fuelSettings": load_monthly_fuel_settings(),
        "groups": {
            "verify": [row_payload(row) for row in verify_rows],
            "openGroupage": [row_payload(row) for row in open_groupage],
            "openDirect": [row_payload(row) for row in open_direct],
            "plannedCustomer": [row_payload(row) for row in planned_customer],
            "plannedGroupage": [row_payload(row) for row in planned_groupage],
            "departed": [row_payload(row) for row in departed_rows],
            "confirmedFtl": [row_payload(row) for row in confirmed_rows],
            "unloadToday": [row_payload(row) for row in unload_today_rows],
            "slaBreaches": [row_payload(row) for row in sla_breach_rows],
            "delivered": [row_payload(row) for row in delivered_rows],
            "deleted": [row_payload(row) for row in deleted_rows],
        },
        "kpis": {
            "verify": len(verify_rows),
            "open": len(open_rows),
            "planning": len(open_groupage) + len(open_direct),
            "planned": len(planned_rows),
            "mailReady": len(planned_groupage),
            "ftlAwaiting": len(planned_customer),
            "customer": len(planned_customer),
            "departed": len(departed_rows),
            "confirmed": len(confirmed_rows),
            "unloadToday": len(unload_today_rows),
            "slaBreaches": len(sla_breach_rows),
            "delivered": len(delivered_rows),
            "groupage": len(open_groupage) + len(planned_groupage),
            "margin": margin_text,
            "monthMargin": f"EUR {format_number(current_month_margin)}",
            "total": len(rows),
            "deleted": deleted_count,
        },
        "dashboard": {
            "today": date.today().strftime("%d/%m/%Y"),
            "currentMonth": current_month,
            "lastReport": report_info(settings),
        },
        "paths": {
            "vtech": settings.get("vtech_path") or (str(DEFAULT_VTECH_PATH) if DEFAULT_VTECH_PATH.exists() else ""),
            "active": settings.get("active_rates_path") or (str(DEFAULT_ACTIVE_PATH) if DEFAULT_ACTIVE_PATH.exists() else ""),
            "brt": settings.get("brt_passive_path") or (str(DEFAULT_BRT_PATH) if DEFAULT_BRT_PATH.exists() else ""),
        },
        "auth": {
            "user": user or {},
            "billingOnly": bool(user and not has_full_access(user) and has_billing_access(user)),
            "canAdmin": has_admin_access(user),
            "roles": USER_ROLES,
            "cloudMode": cloud_mode_enabled(),
            "authDisabled": auth_disabled(),
        },
    }


def parse_mail_date(value: Any) -> date:
    raw_text = clean_text(value)
    if not raw_text:
        return date.today()
    normalized = raw_text.replace(".", "/").replace("-", "/").replace(" ", "")
    parts = normalized.split("/")
    if len(parts) == 2:
        normalized = f"{parts[0]}/{parts[1]}/{date.today().year}"
    for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    raise ValueError("Formato data non valido.")


def wave_tokens_for_date(target_date: date) -> set[str]:
    year_short = str(target_date.year)[-2:]
    return {
        f"{target_date.day:02d}/{target_date.month:02d}",
        f"{target_date.day}/{target_date.month}",
        f"{target_date.day:02d}/{target_date.month}",
        f"{target_date.day}/{target_date.month:02d}",
        f"{target_date.day:02d}/{target_date.month:02d}/{target_date.year}",
        f"{target_date.day}/{target_date.month}/{target_date.year}",
        f"{target_date.day:02d}/{target_date.month:02d}/{year_short}",
        f"{target_date.day}/{target_date.month}/{year_short}",
        target_date.strftime("%Y-%m-%d"),
    }


def wave_contains_date(wave: Any, target_date: date) -> bool:
    wave_text = clean_text(wave).replace(" ", "")
    return bool(wave_text) and any(token in wave_text for token in wave_tokens_for_date(target_date))


def groupage_mail_rows(target_date: date) -> list[dict[str, Any]]:
    rows = [
        row for row in load_shipments_from_db()
        if clean_text(row.get("Stato")) == STATUS_PLANNED
        and is_brt_groupage(row)
        and wave_contains_date(row.get("Wave"), target_date)
    ]
    return sorted(
        rows,
        key=lambda row: (
            display_value(row, "Route to Customer").lower(),
            display_value(row, "Shipment").lower(),
        ),
    )


def groupage_mail_columns() -> list[str]:
    columns = [
        column for column in DISPLAY_COLUMNS
        if column not in GROUPAGE_MAIL_EXCLUDED_COLUMNS
    ]
    for mail_column in GROUPAGE_MAIL_ONLY_COLUMNS:
        if mail_column in columns:
            continue
        if mail_column == "Grand Total Shipment Ftp Vol m3" and "Grand Total Shipment Ftp Wgt Kg" in columns:
            columns.insert(columns.index("Grand Total Shipment Ftp Wgt Kg") + 1, mail_column)
        else:
            columns.append(mail_column)
    return columns


def mail_total_weight_kg(rows: list[dict[str, Any]]) -> float:
    return round(sum(to_float(row.get("Grand Total Shipment Ftp Wgt Kg")) or 0 for row in rows), 2)


def build_mail_weight_total_row(rows: list[dict[str, Any]], columns: list[str]) -> str:
    weight_column = "Grand Total Shipment Ftp Wgt Kg"
    if weight_column not in columns:
        return ""
    cells = []
    for index, column in enumerate(columns):
        if column == weight_column:
            cells.append(f"<td><strong>{html_lib.escape(format_number(mail_total_weight_kg(rows)))}</strong></td>")
        elif index == 0:
            cells.append("<td><strong>Totale kg</strong></td>")
        else:
            cells.append("<td></td>")
    return f"<tr class=\"total-row\">{''.join(cells)}</tr>"


def build_groupage_mail_html(rows: list[dict[str, Any]], target_date: date, mail_token: str = "") -> str:
    columns = groupage_mail_columns()
    total_pallets = sum(ceil_pallets(row.get("Theoretical Pallets")) for row in rows)
    weight_total_row = build_mail_weight_total_row(rows, columns)
    header_cells = "".join(
        f"<th>{html_lib.escape(COLUMN_TITLES.get(column, column))}</th>"
        for column in columns
    )
    body_rows = []
    for row in rows:
        cells = "".join(
            f"<td>{html_lib.escape(display_value(row, column))}</td>"
            for column in columns
        )
        body_rows.append(f"<tr>{cells}</tr>")

    return f"""
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {{ font-family: Segoe UI, Arial, sans-serif; color: #0f172a; font-size: 11pt; }}
      .summary {{ margin: 16px 0 12px; padding: 12px 14px; background: #eef6ff; border-left: 4px solid #2563eb; }}
      table {{ border-collapse: collapse; width: 100%; }}
      th {{ background: #0f172a; color: #fff; text-align: left; padding: 8px; border: 1px solid #dbe4ef; font-weight: 600; }}
      td {{ padding: 7px 8px; border: 1px solid #dbe4ef; vertical-align: top; }}
      tr:nth-child(even) td {{ background: #f8fafc; }}
      tfoot td {{ background: #ecfeff; font-weight: 700; }}
    </style>
  </head>
  <body>
    <div style="display:none; font-size:1px; color:#ffffff;">VTECH-GROUPAGE-MAIL-ID:{html_lib.escape(mail_token)}</div>
    <p>Buongiorno,</p>
    <p>di seguito il dettaglio delle spedizioni che caricherete oggi per il cliente V-Tech:</p>
    <div class="summary">
      <strong>Data Wave:</strong> {target_date.strftime("%d/%m/%Y")}<br>
      <strong>Totale bancali da ritirare:</strong> {total_pallets}
    </div>
    <table>
      <thead><tr>{header_cells}</tr></thead>
      <tbody>{''.join(body_rows)}</tbody>
      {f"<tfoot>{weight_total_row}</tfoot>" if weight_total_row else ""}
    </table>
  </body>
</html>
"""


def build_table_plain_text(rows: list[dict[str, Any]], columns: list[str], include_weight_total: bool = False) -> str:
    header = "\t".join(COLUMN_TITLES.get(column, column) for column in columns)
    body = [
        "\t".join(display_value(row, column).replace("\n", " ").replace("\r", " ") for column in columns)
        for row in rows
    ]
    weight_column = "Grand Total Shipment Ftp Wgt Kg"
    if include_weight_total and weight_column in columns:
        total_cells = [""] * len(columns)
        total_cells[0] = "Totale kg"
        total_cells[columns.index(weight_column)] = format_number(mail_total_weight_kg(rows))
        body.append("\t".join(total_cells))
    return "\n".join([header, *body])


def build_groupage_mail_text(rows: list[dict[str, Any]], target_date: date) -> str:
    columns = groupage_mail_columns()
    total_pallets = sum(ceil_pallets(row.get("Theoretical Pallets")) for row in rows)
    return "\n\n".join(
        [
            "Buongiorno,",
            "di seguito il dettaglio delle spedizioni che caricherete oggi per il cliente V-Tech:",
            f"Data Wave: {target_date.strftime('%d/%m/%Y')}\nTotale bancali da ritirare: {total_pallets}",
            build_table_plain_text(rows, columns, include_weight_total=True),
        ]
    )


def write_mail_files(subject: str, html_body: str, stem: str) -> dict[str, str]:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or "vtech_mail"
    html_path = OUTPUT_DIR / f"{safe_stem}_{timestamp}.html"
    eml_path = OUTPUT_DIR / f"{safe_stem}_{timestamp}.eml"
    html_path.write_text(html_body, encoding="utf-8")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = "vtech@local"
    message["To"] = ""
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain="vtech.local")
    message.set_content("Questa mail contiene una versione HTML. Aprila con Outlook per visualizzare la tabella.")
    message.add_alternative(html_body, subtype="html")
    eml_path.write_bytes(message.as_bytes())
    return {"htmlPath": str(html_path), "emlPath": str(eml_path)}


def display_outlook_mail(subject: str, html_body: str, stem: str = "vtech_mail") -> dict[str, str]:
    mail_files = write_mail_files(subject, html_body, stem)
    html_path = Path(mail_files["htmlPath"])
    eml_path = Path(mail_files["emlPath"])
    ps_script_path = OUTPUT_DIR / "create_outlook_mail.ps1"
    vbs_script_path = OUTPUT_DIR / "create_outlook_mail.vbs"
    log_path = OUTPUT_DIR / "outlook_mail_error.log"

    if cloud_mode_enabled() or platform.system().lower() != "windows":
        return {"mode": "file", **mail_files}

    try:
        import win32com.client  # type: ignore

        outlook = win32com.client.Dispatch("Outlook.Application")
        mail = outlook.CreateItem(0)
        mail.Subject = subject
        mail.HTMLBody = html_body
        mail.Display()
        try:
            mail.GetInspector.Activate()
        except Exception:
            pass
        return {"mode": "outlook", **mail_files}
    except Exception as exc:
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now():%d/%m/%Y %H:%M:%S} - pywin32 - {exc}\n")

    ps_script_path.write_text(
        """
param(
    [Parameter(Mandatory=$true)][string]$HtmlPath,
    [Parameter(Mandatory=$true)][string]$Subject,
    [Parameter(Mandatory=$true)][string]$LogPath
)
try {
    $ErrorActionPreference = "Stop"
    Add-Content -LiteralPath $LogPath -Value ((Get-Date).ToString("dd/MM/yyyy HH:mm:ss") + " - powershell-start - " + $Subject) -Encoding UTF8
    try {
        $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
    } catch {
        $outlook = New-Object -ComObject Outlook.Application
    }
    Add-Content -LiteralPath $LogPath -Value ((Get-Date).ToString("dd/MM/yyyy HH:mm:ss") + " - powershell-outlook-ok") -Encoding UTF8
    $mail = $outlook.CreateItem(0)
    $mail.Subject = $Subject
    $mail.HTMLBody = [System.IO.File]::ReadAllText($HtmlPath, [System.Text.Encoding]::UTF8)
    $mail.Display($false)
    Add-Content -LiteralPath $LogPath -Value ((Get-Date).ToString("dd/MM/yyyy HH:mm:ss") + " - powershell-display-ok") -Encoding UTF8
    Start-Sleep -Milliseconds 500
    try {
        $mail.GetInspector().Activate()
    } catch {}
    Add-Content -LiteralPath $LogPath -Value ((Get-Date).ToString("dd/MM/yyyy HH:mm:ss") + " - powershell-finished") -Encoding UTF8
} catch {
    $line = (Get-Date).ToString("dd/MM/yyyy HH:mm:ss") + " - powershell - " + $_.Exception.Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    exit 1
}
""".strip(),
        encoding="utf-8",
    )

    try:
        subprocess.Popen(
            [
                "cmd.exe",
                "/c",
                "start",
                "",
                "powershell.exe",
                "-NoProfile",
                "-Sta",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ps_script_path),
                "-HtmlPath",
                str(html_path),
                "-Subject",
                subject,
                "-LogPath",
                str(log_path),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"mode": "outlook", **mail_files}
    except Exception as exc:
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now():%d/%m/%Y %H:%M:%S} - powershell-start - {exc}\n")

    vbs_script_path.write_text(
        """
On Error Resume Next
Dim htmlPath, subject, logPath, stream, htmlBody, outlook, mail, inspector, fso, logFile
htmlPath = WScript.Arguments.Item(0)
subject = WScript.Arguments.Item(1)
logPath = WScript.Arguments.Item(2)

Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.LoadFromFile htmlPath
htmlBody = stream.ReadText
stream.Close

Set outlook = CreateObject("Outlook.Application")
Set mail = outlook.CreateItem(0)
mail.Subject = subject
mail.HTMLBody = htmlBody
mail.Display False
WScript.Sleep 500
Err.Clear
Set inspector = mail.GetInspector
If Not inspector Is Nothing Then
    inspector.Activate
End If

If Err.Number <> 0 Then
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set logFile = fso.OpenTextFile(logPath, 8, True)
    logFile.WriteLine Now & " - " & Err.Number & " - " & Err.Description
    logFile.Close
    WScript.Quit 1
End If
""".strip(),
        encoding="utf-8",
    )
    try:
        completed = subprocess.run(
            [
                "cscript.exe",
                "//nologo",
                str(vbs_script_path),
                str(html_path),
                subject,
                str(log_path),
            ],
            capture_output=True,
            text=True,
            timeout=20,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if completed.returncode == 0:
            return {"mode": "outlook", **mail_files}
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(
                f"{datetime.now():%d/%m/%Y %H:%M:%S} - cscript-return "
                f"{completed.returncode} - {completed.stderr or completed.stdout}\n"
            )
    except Exception as exc:
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(f"{datetime.now():%d/%m/%Y %H:%M:%S} - cscript-start - {exc}\n")
    raise RuntimeError(
        "Outlook non ha aperto la bozza. Ho salvato il contenuto HTML in "
        f"{html_path} e scritto il dettaglio errore in {log_path}. "
        f"Puoi comunque aprire il file mail: {eml_path}."
    )


def load_pending_groupage_mails() -> list[dict[str, Any]]:
    if not GROUPAGE_MAIL_PENDING_PATH.exists():
        return []
    try:
        data = json.loads(GROUPAGE_MAIL_PENDING_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def save_pending_groupage_mails(records: list[dict[str, Any]]) -> None:
    GROUPAGE_MAIL_PENDING_PATH.parent.mkdir(parents=True, exist_ok=True)
    GROUPAGE_MAIL_PENDING_PATH.write_text(
        json.dumps(records, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def record_pending_groupage_mail(
    mail_token: str,
    rows: list[dict[str, Any]],
    target_date: date,
    subject: str,
) -> None:
    records = load_pending_groupage_mails()
    records.append(
        {
            "token": mail_token,
            "shipments": [clean_text(row.get("Shipment")) for row in rows if clean_text(row.get("Shipment"))],
            "date": target_date.strftime("%Y-%m-%d"),
            "subject": subject,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "status": "pending",
        }
    )
    save_pending_groupage_mails(records)


def sent_mail_search_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    subject_counts: dict[str, int] = {}
    for record in records:
        subject = clean_text(record.get("subject"))
        if subject:
            subject_counts[subject] = subject_counts.get(subject, 0) + 1

    search_records: list[dict[str, Any]] = []
    for record in records:
        token = clean_text(record.get("token"))
        if not token:
            continue
        terms = [token]
        subject = clean_text(record.get("subject"))
        if subject and subject_counts.get(subject) == 1:
            terms.append(subject)
        search_records.append({"token": token, "terms": terms})
    return search_records


def outlook_sent_tokens_pywin32(search_records: list[dict[str, Any]]) -> set[str]:
    try:
        import win32com.client  # type: ignore
    except ImportError:
        return set()
    if not search_records:
        return set()

    outlook = win32com.client.Dispatch("Outlook.Application")
    namespace = outlook.GetNamespace("MAPI")
    sent_items = namespace.GetDefaultFolder(5)
    items = sent_items.Items
    items.Sort("[SentOn]", True)
    found: set[str] = set()
    limit = min(int(items.Count), 200)
    for index in range(1, limit + 1):
        try:
            item = items.Item(index)
            content = "\n".join(
                [
                    clean_text(getattr(item, "Subject", "")),
                    clean_text(getattr(item, "HTMLBody", "")),
                    clean_text(getattr(item, "Body", "")),
                ]
            )
        except Exception:
            continue
        for record in search_records:
            token = clean_text(record.get("token"))
            terms = [clean_text(term) for term in record.get("terms", []) if clean_text(term)]
            if token and any(term in content for term in terms):
                found.add(token)
    return found


def outlook_sent_tokens_powershell(search_records: list[dict[str, Any]]) -> set[str]:
    if not search_records:
        return set()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    script_path = OUTPUT_DIR / "scan_outlook_sent_groupage.ps1"
    search_path = OUTPUT_DIR / "scan_outlook_sent_groupage_terms.json"
    search_path.write_text(json.dumps(search_records, ensure_ascii=False), encoding="utf-8")
    script_path.write_text(
        """
param(
    [Parameter(Mandatory=$true)][string]$SearchPath
)
$SearchRecords = Get-Content -LiteralPath $SearchPath -Encoding UTF8 | ConvertFrom-Json
$outlook = New-Object -ComObject Outlook.Application
$namespace = $outlook.GetNamespace("MAPI")
$sent = $namespace.GetDefaultFolder(5)
$items = $sent.Items
$items.Sort("[SentOn]", $true)
$limit = [Math]::Min([int]$items.Count, 200)
$found = New-Object System.Collections.Generic.List[string]
for ($i = 1; $i -le $limit; $i++) {
    try {
        $item = $items.Item($i)
        $content = ([string]$item.Subject) + "`n" + ([string]$item.HTMLBody) + "`n" + ([string]$item.Body)
        foreach ($record in $SearchRecords) {
            $token = [string]$record.token
            foreach ($term in $record.terms) {
                $value = [string]$term
                if ($value -and $content.Contains($value) -and -not $found.Contains($token)) {
                    [void]$found.Add($token)
                }
            }
        }
    } catch {}
}
$found | ConvertTo-Json
""".strip(),
        encoding="utf-8",
    )
    completed = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            "-SearchPath",
            str(search_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if completed.returncode != 0 or not clean_text(completed.stdout):
        return set()
    try:
        parsed = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return set()
    if isinstance(parsed, str):
        return {parsed}
    if isinstance(parsed, list):
        return {clean_text(item) for item in parsed if clean_text(item)}
    return set()


def outlook_sent_tokens(search_records: list[dict[str, Any]]) -> set[str]:
    if cloud_mode_enabled() or platform.system().lower() != "windows":
        return set()
    try:
        found = outlook_sent_tokens_pywin32(search_records)
        if found:
            return found
    except Exception:
        pass
    try:
        return outlook_sent_tokens_powershell(search_records)
    except Exception:
        return set()


def scan_groupage_sent_mails() -> dict[str, Any]:
    records = load_pending_groupage_mails()
    pending = [
        record for record in records
        if clean_text(record.get("status")) == "pending" and clean_text(record.get("token"))
    ]
    if not pending:
        return {"departed": 0, "mails": 0}

    sent_tokens = outlook_sent_tokens(sent_mail_search_records(pending))
    if not sent_tokens:
        return {"departed": 0, "mails": 0}

    departed_shipments: set[str] = set()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for record in records:
        token = clean_text(record.get("token"))
        if clean_text(record.get("status")) != "pending" or token not in sent_tokens:
            continue
        try:
            departed_date = parse_mail_date(record.get("date")).strftime("%Y-%m-%d")
        except Exception:
            departed_date = date.today().strftime("%Y-%m-%d")
        shipments = [
            clean_text(shipment)
            for shipment in record.get("shipments", [])
            if clean_text(shipment)
        ]
        for shipment in shipments:
            mark_departed(shipment, departed_at=departed_date)
            departed_shipments.add(shipment)
        record["status"] = "sent"
        record["sent_detected_at"] = now

    save_pending_groupage_mails(records)
    return {"departed": len(departed_shipments), "mails": len(sent_tokens)}


def infer_departed_date_from_wave(row: dict[str, Any]) -> str:
    wave = clean_text(row.get("Wave"))
    for match in re.finditer(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b", wave):
        day, month, year = match.groups()
        year = year or str(date.today().year)
        if len(year) == 2:
            year = f"20{year}"
        try:
            return date(int(year), int(month), int(day)).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date.today().strftime("%Y-%m-%d")


def create_groupage_mail(date_value: Any) -> dict[str, Any]:
    target_date = parse_mail_date(date_value)
    rows = groupage_mail_rows(target_date)
    if not rows:
        tokens = ", ".join(sorted(wave_tokens_for_date(target_date)))
        raise ValueError(f"Nessuna spedizione groupage pianificata con Wave contenente: {tokens}")
    mail_token = f"VTECH-GROUPAGE-{uuid.uuid4().hex}"
    html_body = build_groupage_mail_html(rows, target_date, mail_token)
    text_body = build_groupage_mail_text(rows, target_date)
    subject = f"Ritiri groupage V-Tech - {target_date.strftime('%d/%m/%Y')}"
    mail_result = display_outlook_mail(subject, html_body, "groupage_mail")
    record_pending_groupage_mail(mail_token, rows, target_date, subject)
    return {
        "rows": len(rows),
        "pallets": sum(ceil_pallets(row.get("Theoretical Pallets")) for row in rows),
        "date": target_date.strftime("%d/%m/%Y"),
        "pending": True,
        "mailMode": mail_result.get("mode", ""),
        "mailFile": Path(mail_result.get("emlPath", "")).name if mail_result.get("emlPath") else "",
        "mailPath": mail_result.get("emlPath", ""),
        "downloadUrl": download_url_for_path(mail_result.get("emlPath")),
        "clipboardHtml": html_body,
        "clipboardText": text_body,
    }


def rows_for_shipments(shipments: list[str]) -> list[dict[str, Any]]:
    shipment_order = [clean_text(shipment) for shipment in shipments if clean_text(shipment)]
    row_by_shipment = {
        clean_text(row.get("Shipment")): row
        for row in load_shipments_from_db()
        if clean_text(row.get("Shipment"))
    }
    return [row_by_shipment[shipment] for shipment in shipment_order if shipment in row_by_shipment]


def ftl_mail_rows(shipments: list[str]) -> list[dict[str, Any]]:
    rows = rows_for_shipments(shipments)
    if not rows:
        raise ValueError("Seleziona almeno una spedizione FTL/LTL pianificata.")
    invalid_rows = [
        row for row in rows
        if clean_text(row.get("Stato")) != STATUS_PLANNED or is_brt_groupage(row)
    ]
    if invalid_rows:
        invalid = ", ".join(clean_text(row.get("Shipment")) for row in invalid_rows if clean_text(row.get("Shipment")))
        raise ValueError(f"La mail FTL si puo generare solo da FTL pianificato. Controlla: {invalid}")
    return rows


def build_ftl_mail_html(rows: list[dict[str, Any]]) -> str:
    available_columns = [column for column in FTL_MAIL_COLUMNS if any(clean_text(row.get(column)) for row in rows)]
    weight_total_row = build_mail_weight_total_row(rows, available_columns)
    header_cells = "".join(
        f"<th>{html_lib.escape(COLUMN_TITLES.get(column, column))}</th>"
        for column in available_columns
    )
    body_rows = []
    for row in rows:
        cells = "".join(
            f"<td>{html_lib.escape(display_value(row, column))}</td>"
            for column in available_columns
        )
        body_rows.append(f"<tr>{cells}</tr>")

    return f"""
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body {{ font-family: Segoe UI, Arial, sans-serif; color: #0f172a; font-size: 11pt; }}
      table {{ border-collapse: collapse; width: 100%; margin: 14px 0 16px; }}
      th {{ background: #0f172a; color: #fff; text-align: left; padding: 8px; border: 1px solid #dbe4ef; font-weight: 600; }}
      td {{ padding: 7px 8px; border: 1px solid #dbe4ef; vertical-align: top; }}
      tr:nth-child(even) td {{ background: #f8fafc; }}
      tfoot td {{ background: #ecfeff; font-weight: 700; }}
    </style>
  </head>
  <body>
    <p>Buongiorno,</p>
    <p>Invio i dati relativi la richiesta di gestione consegna Cliente V-Tech della seguente spedizione:</p>
    <table>
      <thead><tr>{header_cells}</tr></thead>
      <tbody>{''.join(body_rows)}</tbody>
      {f"<tfoot>{weight_total_row}</tfoot>" if weight_total_row else ""}
    </table>
    <p>Resto in attesa di conferma.</p>
    <p>Grazie</p>
  </body>
</html>
"""


def build_ftl_mail_text(rows: list[dict[str, Any]]) -> str:
    available_columns = [column for column in FTL_MAIL_COLUMNS if any(clean_text(row.get(column)) for row in rows)]
    return "\n\n".join(
        [
            "Buongiorno,",
            "Invio i dati relativi la richiesta di gestione consegna Cliente V-Tech della seguente spedizione:",
            build_table_plain_text(rows, available_columns, include_weight_total=True),
            "Resto in attesa di conferma.",
            "Grazie",
        ]
    )


def create_ftl_mail(shipments: list[str]) -> dict[str, Any]:
    rows = ftl_mail_rows(shipments)
    shipment_codes = [clean_text(row.get("Shipment")) for row in rows if clean_text(row.get("Shipment"))]
    subject = (
        f"Richiesta gestione consegna V-Tech - {shipment_codes[0]}"
        if len(shipment_codes) == 1
        else f"Richiesta gestione consegna V-Tech - {len(shipment_codes)} spedizioni"
    )
    html_body = build_ftl_mail_html(rows)
    text_body = build_ftl_mail_text(rows)
    mail_result = display_outlook_mail(subject, html_body, "ftl_mail")
    return {
        "rows": len(rows),
        "shipments": shipment_codes,
        "mailMode": mail_result.get("mode", ""),
        "mailFile": Path(mail_result.get("emlPath", "")).name if mail_result.get("emlPath") else "",
        "mailPath": mail_result.get("emlPath", ""),
        "downloadUrl": download_url_for_path(mail_result.get("emlPath")),
        "clipboardHtml": html_body,
        "clipboardText": text_body,
    }


def powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def show_windows_notification(title: str, message: str) -> None:
    script = f"""
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.BalloonTipTitle = {powershell_quote(title)}
$notify.BalloonTipText = {powershell_quote(message)}
$notify.Visible = $true
$notify.ShowBalloonTip(10000)
Start-Sleep -Seconds 11
$notify.Dispose()
"""
    try:
        subprocess.Popen(
            [
                "powershell.exe",
                "-NoProfile",
                "-Sta",
                "-WindowStyle",
                "Hidden",
                "-Command",
                script,
            ],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        pass


def notify_imported_shipments(result: dict[str, Any]) -> None:
    inserted = int(result.get("inserted") or 0)
    if inserted <= 0:
        return
    label = f"{inserted} nuova spedizione" if inserted == 1 else f"{inserted} nuove spedizioni"
    file_name = clean_text(result.get("file"))
    message = f"{label} importate da {file_name}." if file_name else f"{label} importate."
    show_windows_notification("V-Tech Trasporti", message)


def scan_downloads_once() -> dict[str, Any]:
    if not SCAN_LOCK.acquire(blocking=False):
        return {"imported": False, "message": "Scansione gia in corso."}
    try:
        reports = find_outbound_reports()
        latest_report = reports[0] if reports else None
        if not latest_report:
            return {"imported": False, "message": "Nessun Outbound Report trovato nei Download."}
        if is_imported_file_current(latest_report):
            return {"imported": False, "message": "Nessun nuovo file da importare.", "file": latest_report.name}

        settings = load_settings()
        active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
        brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
        _detail_rows, _shipment_rows, summary = run_import(latest_report, active_path, brt_path, save_db=True)
        settings["vtech_path"] = str(latest_report)
        save_settings(settings)
        db_result = summary.get("db", {})
        result = {
            "imported": True,
            "file": latest_report.name,
            "shipments": summary.get("shipment_rows", 0),
            "inserted": db_result.get("inserted", 0),
            "updated": db_result.get("updated", 0),
        }
        notify_imported_shipments(result)
        return result
    finally:
        SCAN_LOCK.release()


def background_download_scan(stop_event: threading.Event) -> None:
    while not stop_event.wait(DOWNLOAD_SCAN_SECONDS):
        try:
            scan_downloads_once()
        except Exception:
            pass


def read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


class VTechWebHandler(BaseHTTPRequestHandler):
    server_version = "VTechWeb/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _current_user(self) -> dict[str, str] | None:
        if auth_disabled():
            return local_admin_user()
        return session_user_from_cookie(self.headers.get("Cookie"))

    def _send_json(self, payload: Any, status: int = 200, headers: dict[str, str] | None = None) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, default=serialize).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _redirect_to_login(self) -> None:
        self.send_response(302)
        self.send_header("Location", "/login.html")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _require_authenticated(self) -> dict[str, str] | None:
        user = self._current_user()
        if not user:
            self._send_json({"ok": False, "error": "Accesso richiesto."}, status=401)
            return None
        return user

    def _forbidden(self) -> None:
        self._send_json({"ok": False, "error": "Accesso non autorizzato per questo ruolo."}, status=403)

    def _send_file(self, path: Path) -> None:
        if not path.exists() and path.is_relative_to(WEB_DIR):
            fallback_path = APP_DIR / path.relative_to(WEB_DIR)
            if fallback_path.exists():
                path = fallback_path
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        content = path.read_bytes()
        mime_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_download_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        if not is_allowed_download_path(path.resolve()):
            self.send_error(403)
            return
        content = path.read_bytes()
        mime_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Disposition", f"attachment; filename=\"{path.name}\"")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        user = self._current_user()
        if path in PUBLIC_GET_PATHS:
            self._send_file(WEB_DIR / "login.html")
            return
        if path == "/api/session":
            if user:
                self._send_json({"ok": True, "user": user, "authenticated": True})
            else:
                self._send_json({"ok": True, "user": {}, "authenticated": False})
            return
        if not user:
            if path.startswith("/api/"):
                self._send_json({"ok": False, "error": "Accesso richiesto."}, status=401)
            else:
                self._redirect_to_login()
            return
        if path == "/api/shipments":
            self._send_json(grouped_shipments(user))
            return
        if path == "/api/users":
            if not has_admin_access(user):
                self._forbidden()
                return
            self._send_json({"ok": True, "users": list_auth_users_payload(), "roles": USER_ROLES})
            return
        if path == "/api/download":
            query = parse_qs(parsed.query)
            raw_path = clean_text((query.get("path") or [""])[0])
            if not raw_path:
                self.send_error(400)
                return
            self._send_download_file(Path(raw_path).resolve())
            return
        if path in {"/", "/index.html"}:
            self._send_file(WEB_DIR / "index.html")
            return
        safe_path = path.lstrip("/").replace("/", "\\")
        file_path = (WEB_DIR / safe_path).resolve()
        if WEB_DIR.resolve() not in file_path.parents and file_path != WEB_DIR.resolve():
            self.send_error(403)
            return
        self._send_file(file_path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            body = read_json_body(self)
            if parsed.path == "/api/login":
                if auth_disabled():
                    self._send_json({"ok": True, "user": local_admin_user()})
                    return
                self._handle_login(body)
                return
            if parsed.path == "/api/logout":
                self._handle_logout()
                return

            user = local_admin_user() if auth_disabled() else self._require_authenticated()
            if not user:
                return
            if parsed.path in FULL_POST_PATHS and not has_full_access(user):
                self._forbidden()
                return
            if parsed.path in ADMIN_POST_PATHS and not has_admin_access(user):
                self._forbidden()
                return
            if parsed.path in BILLING_POST_PATHS and not has_billing_access(user):
                self._forbidden()
                return

            if parsed.path == "/api/import":
                self._handle_import(body, user)
                return
            if parsed.path == "/api/upload-file":
                self._handle_upload_file(body, user)
                return
            if parsed.path == "/api/groupage-mail":
                self._handle_groupage_mail(body, user)
                return
            if parsed.path == "/api/ftl-mail":
                self._handle_ftl_mail(body, user)
                return
            if parsed.path == "/api/passive-export":
                self._handle_passive_export(body, user)
                return
            if parsed.path == "/api/active-export":
                self._handle_active_export(body, user)
                return
            if parsed.path == "/api/fuel-settings":
                self._handle_fuel_settings(body, user)
                return
            if parsed.path == "/api/scan-downloads":
                self._handle_scan_downloads(user)
                return
            if parsed.path == "/api/action":
                self._handle_action(body, user)
                return
            if parsed.path == "/api/open-path":
                self._handle_open_path(body)
                return
            if parsed.path == "/api/users":
                self._handle_users(body, user)
                return
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, status=400)
            return
        self.send_error(404)

    def _handle_login(self, body: dict[str, Any]) -> None:
        username = clean_text(body.get("username"))
        password = clean_text(body.get("password"))
        user = authenticate_user(username, password)
        if not user:
            self._send_json({"ok": False, "error": "Utente o password non validi."}, status=401)
            return
        token = create_session(user)
        cookie = f"{SESSION_COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax"
        self._send_json({"ok": True, "user": user}, headers={"Set-Cookie": cookie})

    def _handle_logout(self) -> None:
        destroy_session(self.headers.get("Cookie"))
        cookie = f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
        self._send_json({"ok": True}, headers={"Set-Cookie": cookie})

    def _handle_users(self, body: dict[str, Any], user: dict[str, str]) -> None:
        action = clean_text(body.get("action") or "save").lower()
        username = clean_text(body.get("username")).lower()
        if not re.fullmatch(r"[a-z0-9._-]{3,40}", username):
            raise ValueError("Username non valido. Usa almeno 3 caratteri: lettere, numeri, punto, trattino o underscore.")

        users = load_auth_users()
        if action == "delete":
            if username == clean_text(user.get("username")).lower():
                raise ValueError("Non puoi eliminare l'utente con cui sei entrato.")
            if username not in users:
                raise ValueError("Utente non trovato.")
            users.pop(username, None)
            save_auth_users_payload(users)
            self._send_json({"ok": True, "users": list_auth_users_payload()})
            return

        display_name = clean_text(body.get("displayName")) or username
        role = clean_text(body.get("role")).lower() or "operator"
        password = clean_text(body.get("password"))
        if role not in USER_ROLES:
            raise ValueError("Ruolo non valido.")

        current = users.get(username)
        if current is not None and not isinstance(current, dict):
            current = {}
        is_new = not current
        if is_new and not password:
            raise ValueError("Per un nuovo utente devi inserire una password iniziale.")

        record = dict(current or {})
        record["displayName"] = display_name
        record["role"] = role
        if password:
            if len(password) < 8:
                raise ValueError("La password deve avere almeno 8 caratteri.")
            record["passwordHash"] = password_hash(password)
        users[username] = record
        save_auth_users_payload(users)
        self._send_json({"ok": True, "users": list_auth_users_payload()})

    def _handle_import(self, body: dict[str, Any], user: dict[str, str]) -> None:
        vtech_path = Path(clean_text(body.get("vtechPath")))
        active_path = Path(clean_text(body.get("activeRatesPath"))) if clean_text(body.get("activeRatesPath")) else None
        brt_path = Path(clean_text(body.get("brtPassivePath"))) if clean_text(body.get("brtPassivePath")) else None
        if not vtech_path.exists():
            raise ValueError("File V-Tech non trovato.")
        settings = load_settings()
        settings["vtech_path"] = str(vtech_path)
        settings["active_rates_path"] = str(active_path) if active_path else ""
        settings["brt_passive_path"] = str(brt_path) if brt_path else ""
        save_settings(settings)
        _detail_rows, _shipment_rows, summary = run_import(vtech_path, active_path, brt_path, save_db=True)
        self._send_json({"ok": True, "summary": summary, "data": grouped_shipments(user)})

    def _handle_upload_file(self, body: dict[str, Any], user: dict[str, str]) -> None:
        kind = clean_text(body.get("kind")).lower()
        if kind not in UPLOAD_SETTINGS_KEYS:
            raise ValueError("Tipo file non valido.")

        filename = safe_upload_filename(body.get("filename"), f"{kind}_upload")
        extension = Path(filename).suffix.lower()
        if extension not in UPLOAD_EXTENSIONS[kind]:
            allowed = ", ".join(sorted(UPLOAD_EXTENSIONS[kind]))
            raise ValueError(f"Formato non valido per {kind}. Formati ammessi: {allowed}")

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = UPLOAD_DIR / f"{kind}_{timestamp}_{filename}"
        content = decode_upload_base64(body.get("contentBase64"))
        target.write_bytes(content)

        settings = load_settings()
        settings[UPLOAD_SETTINGS_KEYS[kind]] = str(target)
        save_settings(settings)

        summary: dict[str, Any] | None = None
        if kind == "report":
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            _detail_rows, _shipment_rows, summary = run_import(target, active_path, brt_path, save_db=True)

        self._send_json({
            "ok": True,
            "kind": kind,
            "file": target.name,
            "path": str(target),
            "summary": summary,
            "data": grouped_shipments(user),
        })

    def _handle_groupage_mail(self, body: dict[str, Any], user: dict[str, str]) -> None:
        result = create_groupage_mail(body.get("date"))
        self._send_json({"ok": True, "result": result, "data": grouped_shipments(user)})

    def _handle_ftl_mail(self, body: dict[str, Any], user: dict[str, str]) -> None:
        shipments = [
            clean_text(shipment)
            for shipment in body.get("shipments", [])
            if clean_text(shipment)
        ]
        result = create_ftl_mail(shipments)
        self._send_json({"ok": True, "result": result, "data": grouped_shipments(user)})

    def _handle_passive_export(self, body: dict[str, Any], user: dict[str, str]) -> None:
        month = clean_text(body.get("month"))
        output_path = export_passive_billing_by_carrier(month or None)
        self._send_json({
            "ok": True,
            "file": output_path.name,
            "path": str(output_path),
            "downloadUrl": download_url_for_path(output_path),
            "data": grouped_shipments(user),
        })

    def _handle_active_export(self, body: dict[str, Any], user: dict[str, str]) -> None:
        month = clean_text(body.get("month"))
        output_path = export_active_billing_report(month or None)
        self._send_json({
            "ok": True,
            "file": output_path.name,
            "path": str(output_path),
            "downloadUrl": download_url_for_path(output_path),
            "data": grouped_shipments(user),
        })

    def _handle_fuel_settings(self, body: dict[str, Any], user: dict[str, str]) -> None:
        month = clean_text(body.get("month"))
        settings = save_monthly_fuel_settings(
            month,
            body.get("activeFuel"),
            body.get("passiveFuel"),
        )
        self._send_json({"ok": True, "fuelSettings": settings, "data": grouped_shipments(user)})

    def _handle_scan_downloads(self, user: dict[str, str]) -> None:
        if cloud_mode_enabled():
            self._send_json({
                "ok": True,
                "result": {"imported": False, "message": "In cloud i report si caricano dal browser."},
                "sent": {"departed": 0, "mails": 0},
                "data": grouped_shipments(user),
            })
            return
        try:
            result = scan_downloads_once()
        except Exception as exc:
            result = {
                "imported": False,
                "error": str(exc),
                "message": "Import automatico non riuscito, controllo mail eseguito comunque.",
            }
        sent_result = scan_groupage_sent_mails()
        self._send_json({"ok": True, "result": result, "sent": sent_result, "data": grouped_shipments(user)})

    def _handle_action(self, body: dict[str, Any], user: dict[str, str]) -> None:
        action = clean_text(body.get("action"))
        shipments = [
            clean_text(shipment)
            for shipment in body.get("shipments", [])
            if clean_text(shipment)
        ]
        if not shipments:
            raise ValueError("Seleziona almeno una spedizione.")

        action_result: dict[str, Any] = {}
        if action == "planned":
            for shipment in shipments:
                mark_planned(shipment)
        elif action == "unplanned":
            for shipment in shipments:
                mark_unplanned(shipment)
        elif action == "delivered":
            xml_paths: list[str] = []
            for shipment in shipments:
                _delivered_at, xml_path = mark_delivered(shipment)
                xml_paths.append(str(xml_path))
            action_result["xmlPaths"] = xml_paths
            action_result["xmlFiles"] = [Path(path).name for path in xml_paths]
            action_result["downloadUrl"] = download_url_for_path(xml_paths[0] if xml_paths else "")
        elif action == "departed":
            rows_by_shipment = {
                clean_text(row.get("Shipment")): row
                for row in rows_for_shipments(shipments)
            }
            manual_departed_at = clean_text(body.get("departedAt"))
            for shipment in shipments:
                departed_at = manual_departed_at or infer_departed_date_from_wave(rows_by_shipment.get(shipment, {}))
                mark_departed(shipment, departed_at=departed_at)
        elif action == "confirmed":
            for shipment in shipments:
                mark_confirmed(shipment)
        elif action == "delete":
            delete_shipments_permanently(shipments)
        elif action == "restore_deleted":
            restore_deleted_shipments(shipments)
        elif action == "purge_deleted":
            purge_deleted_shipments(shipments)
        elif action == "carrier":
            carrier = clean_text(body.get("carrier")).upper()
            if not carrier:
                raise ValueError("Scegli un vettore.")
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            for shipment in shipments:
                set_manual_carrier(shipment, carrier, active_path, brt_path)
        elif action == "service_level":
            service_level = clean_text(body.get("serviceLevel")).upper()
            if not service_level:
                raise ValueError("Scegli un service level.")
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            for shipment in shipments:
                set_manual_service_level(shipment, service_level, active_path, brt_path)
        elif action == "freight_code":
            freight_code = clean_text(body.get("freightCode")).upper()
            required_delivery_date = body.get("requiredDeliveryDate")
            if not freight_code:
                raise ValueError("Scegli DKL o DKV.")
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            for shipment in shipments:
                set_manual_freight_code(shipment, freight_code, required_delivery_date, active_path, brt_path)
        elif action == "required_delivery_date":
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            clear_required_date = bool(body.get("clear"))
            required_delivery_date = body.get("requiredDeliveryDate")
            for shipment in shipments:
                set_required_delivery_date(shipment, required_delivery_date, active_path, clear=clear_required_date)
        elif action == "manual_passive":
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            clear_manual = bool(body.get("clear"))
            passive_cost = body.get("passiveCost")
            for shipment in shipments:
                set_manual_passive_cost(shipment, passive_cost, active_path, brt_path, clear=clear_manual)
        elif action == "manual_pallets":
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            clear_manual = bool(body.get("clear"))
            pallets = body.get("pallets")
            for shipment in shipments:
                set_manual_pallets(shipment, pallets, active_path, brt_path, clear=clear_manual)
        elif action in {"unload_date", "unload_booking"}:
            clear_unload = bool(body.get("clear"))
            unload_date = body.get("unloadDate")
            unload_time = body.get("unloadTime")
            booking_ref = body.get("bookingRef")
            for shipment in shipments:
                set_unload_booking(shipment, unload_date, unload_time, booking_ref, clear=clear_unload)
        elif action == "active_urgent":
            settings = load_settings()
            active_path = Path(settings.get("active_rates_path", "")) if settings.get("active_rates_path") else None
            brt_path = Path(settings.get("brt_passive_path", "")) if settings.get("brt_passive_path") else None
            clear_urgent = bool(body.get("clear"))
            for shipment in shipments:
                set_active_urgent(shipment, active_path, brt_path, clear=clear_urgent)
        else:
            raise ValueError(f"Azione non valida: {action}")

        self._send_json({"ok": True, **action_result, "data": grouped_shipments(user)})

    def _handle_open_path(self, body: dict[str, Any]) -> None:
        if cloud_mode_enabled() or platform.system().lower() != "windows":
            raise ValueError("In cloud i file si scaricano dal browser, non posso aprire una cartella locale del server.")
        raw_path = clean_text(body.get("path"))
        if not raw_path:
            raise ValueError("Percorso file mancante.")
        target = Path(raw_path).resolve()
        downloads_root = DOWNLOADS_DIR.resolve()
        if downloads_root not in target.parents and target != downloads_root:
            raise ValueError("Posso aprire solo file nella cartella Download.")
        if not target.exists():
            raise FileNotFoundError(f"File non trovato: {target}")
        if target.is_file():
            subprocess.Popen(["explorer.exe", f"/select,{target}"])
        else:
            subprocess.Popen(["explorer.exe", str(target)])
        self._send_json({"ok": True})


def main() -> None:
    parser = argparse.ArgumentParser(description="Dashboard web locale V-Tech Trasporti.")
    default_host = os.environ.get("HOST") or ("0.0.0.0" if cloud_mode_enabled() else "127.0.0.1")
    default_port = int(os.environ.get("PORT") or 8765)
    parser.add_argument("--host", default=default_host)
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    ensure_auth_users()
    server = ThreadingHTTPServer((args.host, args.port), VTechWebHandler)
    browser_host = "127.0.0.1" if args.host in {"0.0.0.0", "::"} else args.host
    url = f"http://{browser_host}:{args.port}"
    print(f"V-Tech web locale avviata: {url}")
    if args.host == "0.0.0.0":
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
            print(f"Accesso rete ufficio: http://{local_ip}:{args.port}")
        except OSError:
            print(f"Accesso rete ufficio: http://IP_DEL_TUO_PC:{args.port}")
        print(f"Credenziali iniziali: {AUTH_TEMP_PASSWORDS_PATH}")
    if not args.no_browser:
        webbrowser.open(url)
    stop_scan = threading.Event()
    scan_thread = threading.Thread(target=background_download_scan, args=(stop_scan,), daemon=True)
    scan_thread.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_scan.set()
        server.server_close()


if __name__ == "__main__":
    main()
