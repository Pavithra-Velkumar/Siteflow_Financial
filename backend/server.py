from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import base64
import json as _json
import logging
import bcrypt
import jwt
import requests
import httpx
from io import BytesIO
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Response, Query, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as pdfcanvas


# ---------------- Setup ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get('APP_NAME', 'siteflow-financials')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "SiteFlow Financials")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="SiteFlow Financials API")
api = APIRouter(prefix="/api")


# ---------------- Auth Utils ----------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(user_id: str, email: str, ttl_minutes: int = 60 * 24 * 7) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
               "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------- Storage ----------------
storage_key = None
def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    business_name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TransactionIn(BaseModel):
    type: str  # "incoming" | "outgoing"
    amount: float
    date: str  # ISO
    project_site: Optional[str] = ""
    party_name: Optional[str] = ""  # vendor or client
    category: str
    payment_method: str
    status: str  # completed | pending | overdue
    notes: Optional[str] = ""
    document_id: Optional[str] = None
    client_email: Optional[str] = ""

class EmployeeIn(BaseModel):
    name: str
    role: str
    pay_rate: float
    rate_type: str  # hourly | daily
    contact: Optional[str] = ""
    active: bool = True

class PayoutIn(BaseModel):
    employee_id: str
    units: float  # hours or days
    total_pay: float
    date: str
    project_site: Optional[str] = ""
    notes: Optional[str] = ""

class TaskIn(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str
    end_date: Optional[str] = None
    project_site: Optional[str] = ""
    priority: str = "medium"  # low | medium | high
    status: str = "not_started"  # not_started | in_progress | blocked | completed
    assignees: List[str] = []
    color: Optional[str] = "#ea580c"


def now_iso():
    return datetime.now(timezone.utc).isoformat()

def strip_id(doc):
    if doc and "_id" in doc:
        doc.pop("_id")
    return doc


# ---------------- Auth Endpoints ----------------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "business_name": payload.business_name or "",
        "password_hash": hash_password(payload.password),
        "role": "owner",
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], email)
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ("_id", "password_hash")}}

@api.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], email)
    strip_id(user)
    user.pop("password_hash", None)
    return {"token": token, "user": user}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def logout():
    return {"ok": True}


# ---------------- Transactions ----------------
@api.get("/transactions")
async def list_transactions(user=Depends(get_current_user)):
    items = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
    return items

@api.post("/transactions")
async def create_transaction(payload: TransactionIn, user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = now_iso()
    await db.transactions.insert_one(doc)
    return strip_id(doc)

@api.put("/transactions/{tid}")
async def update_transaction(tid: str, payload: TransactionIn, user=Depends(get_current_user)):
    res = await db.transactions.update_one({"id": tid, "user_id": user["id"]}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.transactions.find_one({"id": tid}, {"_id": 0})
    return doc

@api.delete("/transactions/{tid}")
async def delete_transaction(tid: str, user=Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- Employees ----------------
@api.get("/employees")
async def list_employees(user=Depends(get_current_user)):
    items = await db.employees.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(500)
    return items

@api.post("/employees")
async def create_employee(payload: EmployeeIn, user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = now_iso()
    await db.employees.insert_one(doc)
    return strip_id(doc)

@api.put("/employees/{eid}")
async def update_employee(eid: str, payload: EmployeeIn, user=Depends(get_current_user)):
    res = await db.employees.update_one({"id": eid, "user_id": user["id"]}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.employees.find_one({"id": eid}, {"_id": 0})

@api.delete("/employees/{eid}")
async def delete_employee(eid: str, user=Depends(get_current_user)):
    res = await db.employees.delete_one({"id": eid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- Payouts ----------------
@api.get("/payouts")
async def list_payouts(user=Depends(get_current_user)):
    items = await db.payouts.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
    return items

@api.post("/payouts")
async def create_payout(payload: PayoutIn, user=Depends(get_current_user)):
    emp = await db.employees.find_one({"id": payload.employee_id, "user_id": user["id"]}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["employee_name"] = emp["name"]
    doc["created_at"] = now_iso()
    await db.payouts.insert_one(doc)
    # Also create linked outgoing transaction (payroll)
    txn = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "outgoing",
        "amount": payload.total_pay,
        "date": payload.date,
        "project_site": payload.project_site or "",
        "party_name": emp["name"],
        "category": "Labor/Payroll",
        "payment_method": "Bank Transfer",
        "status": "completed",
        "notes": f"Payroll payout ({payload.units} {emp.get('rate_type','hourly')} units)",
        "payout_id": doc["id"],
        "created_at": now_iso(),
    }
    await db.transactions.insert_one(txn)
    doc["transaction_id"] = txn["id"]
    return strip_id(doc)

@api.delete("/payouts/{pid}")
async def delete_payout(pid: str, user=Depends(get_current_user)):
    p = await db.payouts.find_one({"id": pid, "user_id": user["id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    await db.payouts.delete_one({"id": pid})
    await db.transactions.delete_many({"payout_id": pid, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Tasks ----------------
@api.get("/tasks")
async def list_tasks(user=Depends(get_current_user)):
    items = await db.tasks.find({"user_id": user["id"]}, {"_id": 0}).sort("date", 1).to_list(1000)
    return items

@api.post("/tasks")
async def create_task(payload: TaskIn, user=Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = now_iso()
    await db.tasks.insert_one(doc)
    return strip_id(doc)

@api.put("/tasks/{tid}")
async def update_task(tid: str, payload: TaskIn, user=Depends(get_current_user)):
    res = await db.tasks.update_one({"id": tid, "user_id": user["id"]}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.tasks.find_one({"id": tid}, {"_id": 0})

@api.delete("/tasks/{tid}")
async def delete_task(tid: str, user=Depends(get_current_user)):
    res = await db.tasks.delete_one({"id": tid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- Documents ----------------
@api.get("/documents")
async def list_documents(user=Depends(get_current_user)):
    items = await db.documents.find({"user_id": user["id"], "is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename or "file").split(".")[-1].lower() if "." in (file.filename or "") else "bin"
    doc_id = str(uuid.uuid4())
    path = f"{APP_NAME}/uploads/{user['id']}/{doc_id}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    record = {
        "id": doc_id,
        "user_id": user["id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.documents.insert_one(record)
    return strip_id(record)

@api.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, authorization: str = Header(None), auth: str = Query(None)):
    # Manual auth (token in query or header) since <a href> can't set headers
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    record = await db.documents.find_one({"id": doc_id, "user_id": payload["sub"], "is_deleted": {"$ne": True}}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    data, ct = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type") or ct,
                    headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'})

@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(get_current_user)):
    res = await db.documents.update_one({"id": doc_id, "user_id": user["id"]}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------- Seed & Dashboard Summary ----------------
@api.post("/seed-demo")
async def seed_demo(user=Depends(get_current_user)):
    """Load realistic demo data for the current user (if none exists)."""
    existing = await db.transactions.count_documents({"user_id": user["id"]})
    if existing > 0:
        return {"ok": True, "message": "Data already exists", "seeded": False}
    uid = user["id"]
    today = datetime.now(timezone.utc)

    employees = [
        {"name": "Ramesh Kumar", "role": "Site Supervisor", "pay_rate": 1200, "rate_type": "daily", "contact": "+91 98200 11111", "active": True},
        {"name": "Suresh Yadav", "role": "Carpenter", "pay_rate": 350, "rate_type": "hourly", "contact": "+91 98200 22222", "active": True},
        {"name": "Anil Sharma", "role": "Electrician", "pay_rate": 400, "rate_type": "hourly", "contact": "+91 98200 33333", "active": True},
        {"name": "Vikas Patel", "role": "Mason", "pay_rate": 900, "rate_type": "daily", "contact": "+91 98200 44444", "active": True},
        {"name": "Deepak Verma", "role": "Helper", "pay_rate": 500, "rate_type": "daily", "contact": "+91 98200 55555", "active": True},
    ]
    emp_docs = []
    for e in employees:
        d = {**e, "id": str(uuid.uuid4()), "user_id": uid, "created_at": now_iso()}
        emp_docs.append(d)
    await db.employees.insert_many(emp_docs)

    projects = ["Green Valley Villa - Whitefield", "Sunrise Apartments - Andheri"]
    txns_seed = [
        ("incoming", 850000, 2, "Client Retainer", "Bank Transfer", "completed", projects[0], "Kavita Reddy"),
        ("incoming", 450000, 5, "Milestone Billing", "Bank Transfer", "completed", projects[0], "Kavita Reddy"),
        ("incoming", 320000, 10, "Milestone Billing", "Check", "pending", projects[1], "Rakesh Mehta"),
        ("outgoing", 185000, 3, "Materials", "Bank Transfer", "completed", projects[0], "Ambuja Cement Depot"),
        ("outgoing", 95000, 6, "Materials", "Cash", "completed", projects[1], "Local Steel Traders"),
        ("outgoing", 42000, 8, "Equipment", "Card", "completed", projects[0], "JCB Rentals"),
        ("outgoing", 18500, 11, "Permits", "Bank Transfer", "completed", projects[1], "BMC Municipal Office"),
        ("outgoing", 68000, 12, "Subcontractors", "Bank Transfer", "pending", projects[0], "Kohli Plumbing Works"),
        ("outgoing", 5200, 14, "Fuel", "Card", "completed", projects[1], "HP Petrol Pump"),
        ("outgoing", 12500, 15, "Materials", "Cash", "overdue", projects[0], "Tile World"),
    ]
    txns = []
    for t, amt, days_ago, cat, pm, st, proj, party in txns_seed:
        txns.append({
            "id": str(uuid.uuid4()), "user_id": uid, "type": t, "amount": amt,
            "date": (today - timedelta(days=days_ago)).isoformat(),
            "project_site": proj, "party_name": party, "category": cat,
            "payment_method": pm, "status": st, "notes": "", "created_at": now_iso(),
        })
    await db.transactions.insert_many(txns)

    tasks = [
        {"title": "Foundation concrete pouring", "date": (today + timedelta(days=1)).isoformat(),
         "project_site": projects[0], "priority": "high", "status": "in_progress",
         "assignees": [emp_docs[0]["id"], emp_docs[3]["id"]], "color": "#ea580c", "description": "Complete slab foundation for block A"},
        {"title": "Electrical wiring - 3rd floor", "date": (today + timedelta(days=3)).isoformat(),
         "project_site": projects[1], "priority": "medium", "status": "not_started",
         "assignees": [emp_docs[2]["id"]], "color": "#f59e0b", "description": "Install main circuit and outlets"},
        {"title": "Cement delivery scheduled", "date": (today + timedelta(days=2)).isoformat(),
         "project_site": projects[0], "priority": "high", "status": "not_started",
         "assignees": [emp_docs[0]["id"]], "color": "#10b981", "description": "50 bags Ambuja OPC 53"},
        {"title": "Kitchen tile work", "date": (today + timedelta(days=6)).isoformat(),
         "project_site": projects[1], "priority": "low", "status": "blocked",
         "assignees": [emp_docs[1]["id"]], "color": "#ef4444", "description": "Waiting for tile shipment"},
    ]
    for t in tasks:
        t.update({"id": str(uuid.uuid4()), "user_id": uid, "created_at": now_iso(),
                  "end_date": None})
    await db.tasks.insert_many(tasks)

    return {"ok": True, "seeded": True}


# ---------------- Projects P&L, Invoice PDF, Bill Auto-Read, Reminders ----------------
@api.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    txns = await db.transactions.find({"user_id": user["id"]}, {"_id": 0}).to_list(5000)
    tasks = await db.tasks.find({"user_id": user["id"]}, {"_id": 0}).to_list(2000)
    projects: dict = {}
    def bucket(name):
        key = (name or "Unassigned").strip() or "Unassigned"
        return projects.setdefault(key, {
            "name": key, "revenue": 0.0, "expense": 0.0,
            "txn_count": 0, "task_count": 0,
            "pending_count": 0, "overdue_count": 0,
        })
    for t in txns:
        p = bucket(t.get("project_site"))
        p["txn_count"] += 1
        amt = float(t.get("amount") or 0)
        if t.get("type") == "incoming":
            p["revenue"] += amt
        else:
            p["expense"] += amt
        if t.get("status") == "pending":
            p["pending_count"] += 1
        elif t.get("status") == "overdue":
            p["overdue_count"] += 1
    for tk in tasks:
        p = bucket(tk.get("project_site"))
        p["task_count"] += 1
    result = list(projects.values())
    for r in result:
        r["net"] = r["revenue"] - r["expense"]
    result.sort(key=lambda x: (x["revenue"] + x["expense"]), reverse=True)
    return result


@api.get("/projects/details")
async def project_details(name: str, user=Depends(get_current_user)):
    txns = await db.transactions.find({"user_id": user["id"], "project_site": name}, {"_id": 0}).sort("date", -1).to_list(2000)
    tasks = await db.tasks.find({"user_id": user["id"], "project_site": name}, {"_id": 0}).sort("date", 1).to_list(500)
    return {"transactions": txns, "tasks": tasks}


def _generate_invoice_pdf(txn: dict, owner: dict) -> bytes:
    buf = BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=A4)
    W, H = A4
    orange = HexColor("#ea580c")
    slate = HexColor("#1e293b")
    muted = HexColor("#64748b")
    light = HexColor("#f1f5f9")

    # Header band
    c.setFillColor(slate)
    c.rect(0, H - 40 * mm, W, 40 * mm, fill=1, stroke=0)
    c.setFillColor(orange)
    c.rect(20 * mm, H - 32 * mm, 12 * mm, 12 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 22)
    c.drawString(40 * mm, H - 24 * mm, "INVOICE")
    c.setFont("Helvetica", 10)
    c.drawString(40 * mm, H - 30 * mm, owner.get("business_name") or owner.get("name") or "SiteFlow Financials")

    # Right meta
    c.setFont("Helvetica", 9)
    c.drawRightString(W - 20 * mm, H - 22 * mm, f"Invoice #: {txn['id'][:8].upper()}")
    date_str = (txn.get("date") or "")[:10]
    c.drawRightString(W - 20 * mm, H - 27 * mm, f"Issue date: {date_str}")
    c.drawRightString(W - 20 * mm, H - 32 * mm, f"Status: {txn.get('status', '').capitalize()}")

    # Bill to
    y = H - 55 * mm
    c.setFillColor(muted)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(20 * mm, y, "BILL TO")
    c.drawString(110 * mm, y, "FROM")
    c.setFillColor(slate)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y - 6 * mm, txn.get("party_name") or "—")
    c.drawString(110 * mm, y - 6 * mm, owner.get("business_name") or owner.get("name") or "")
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    if txn.get("client_email"):
        c.drawString(20 * mm, y - 11 * mm, txn["client_email"])
    c.drawString(110 * mm, y - 11 * mm, owner.get("email", ""))

    # Project box
    y2 = y - 25 * mm
    c.setFillColor(light)
    c.rect(20 * mm, y2 - 4 * mm, W - 40 * mm, 12 * mm, fill=1, stroke=0)
    c.setFillColor(muted)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(24 * mm, y2 + 4 * mm, "PROJECT / SITE")
    c.setFillColor(slate)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(24 * mm, y2 - 1.5 * mm, txn.get("project_site") or "—")

    # Line items table
    y3 = y2 - 22 * mm
    c.setFillColor(slate)
    c.rect(20 * mm, y3, W - 40 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(24 * mm, y3 + 2.5 * mm, "DESCRIPTION")
    c.drawRightString(W - 24 * mm, y3 + 2.5 * mm, "AMOUNT")

    c.setFillColor(slate)
    c.setFont("Helvetica", 10)
    desc = f"{txn.get('category', 'Milestone Billing')}"
    if txn.get("notes"):
        desc += f" — {txn['notes'][:80]}"
    c.drawString(24 * mm, y3 - 10 * mm, desc)
    amt = float(txn.get("amount") or 0)
    c.drawRightString(W - 24 * mm, y3 - 10 * mm, f"Rs {amt:,.2f}")

    # Total band
    y4 = y3 - 30 * mm
    c.setFillColor(orange)
    c.rect(110 * mm, y4, W - 130 * mm, 14 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(114 * mm, y4 + 5 * mm, "TOTAL DUE")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(W - 24 * mm, y4 + 4 * mm, f"Rs {amt:,.2f}")

    # Payment method + footer
    c.setFillColor(muted)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, y4 + 5 * mm, f"Payment method: {txn.get('payment_method', 'Bank Transfer')}")
    c.setFillColor(slate)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(20 * mm, 25 * mm, "Thank you for your business — SiteFlow Financials")
    c.setFillColor(muted)
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, 20 * mm, "This invoice was generated by SiteFlow Financials. Amounts shown in INR.")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.read()


@api.get("/transactions/{tid}/invoice")
async def transaction_invoice(tid: str, authorization: str = Header(None), auth: str = Query(None)):
    token = authorization[7:] if (authorization or "").startswith("Bearer ") else auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    txn = await db.transactions.find_one({"id": tid, "user_id": payload["sub"]}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Not found")
    owner = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0}) or {}
    pdf = _generate_invoice_pdf(txn, owner)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="invoice-{tid[:8]}.pdf"'})


@api.post("/scan-bill")
async def scan_bill(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Use Gemini 3 Flash vision to extract vendor/amount/date/category from an uploaded bill image."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    b64 = base64.b64encode(data).decode()

    system_msg = (
        "You extract structured data from a construction/business receipt or bill image. "
        "Return ONLY a valid JSON object (no markdown fences, no prose) with these exact keys:\n"
        '  "vendor_name": string,\n'
        '  "total_amount": number in Indian Rupees (₹) as a plain number without commas or symbols,\n'
        '  "date": "YYYY-MM-DD" or null,\n'
        '  "category": one of "Materials" | "Labor/Payroll" | "Equipment" | "Permits" | "Subcontractors" | "Fuel" | "Equipment Maintenance" | "Other",\n'
        '  "notes": short summary string (max 120 chars).\n'
        "If a field is unclear, guess your best value. Never return null for vendor_name — use empty string instead."
    )
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"scan-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("gemini", "gemini-3-flash-preview")

    try:
        resp = await chat.send_message(UserMessage(
            text="Extract the receipt fields as JSON. Respond with JSON only.",
            file_contents=[ImageContent(image_base64=b64)],
        ))
    except Exception as e:
        logger.error(f"Gemini scan-bill error: {e}")
        raise HTTPException(status_code=502, detail=f"AI scan failed: {str(e)[:120]}")

    text = str(resp).strip()
    # Strip markdown code fences if any
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = _json.loads(text)
    except Exception:
        # Try to locate first {...} block
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = _json.loads(text[start:end + 1])
            except Exception:
                parsed = {}
        else:
            parsed = {}
    return {
        "vendor_name": parsed.get("vendor_name") or "",
        "total_amount": float(parsed.get("total_amount") or 0),
        "date": parsed.get("date") or None,
        "category": parsed.get("category") or "Other",
        "notes": parsed.get("notes") or "",
    }


@api.post("/transactions/{tid}/send-reminder")
async def send_reminder(tid: str, user=Depends(get_current_user)):
    txn = await db.transactions.find_one({"id": tid, "user_id": user["id"]}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Not found")
    if txn.get("type") != "incoming":
        raise HTTPException(status_code=400, detail="Reminders only apply to incoming transactions")
    email = (txn.get("client_email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="No client email set on this transaction. Edit and add a client email first.")
    if not EMAIL_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured")

    amt = float(txn.get("amount") or 0)
    party = txn.get("party_name") or "Client"
    project = txn.get("project_site") or ""
    due_date = (txn.get("date") or "")[:10]
    biz = (user.get("business_name") or user.get("name") or EMAIL_FROM_NAME)

    html = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; background:#f1f5f9; padding:24px 0;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,0.08);">
          <tr><td style="background:#1e293b; padding:20px 28px;">
            <div style="color:#ea580c; font-weight:800; font-size:14px; letter-spacing:1px;">SITEFLOW · PAYMENT REMINDER</div>
            <div style="color:#f8fafc; font-size:22px; font-weight:700; margin-top:6px;">Payment overdue</div>
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="color:#0f172a; font-size:15px; margin:0 0 12px;">Hello {party},</p>
            <p style="color:#334155; font-size:14px; line-height:1.6; margin:0 0 20px;">
              This is a friendly reminder that a payment for the project <strong>{project or '—'}</strong>
              is currently overdue. We would appreciate your attention to this at the earliest.
            </p>
            <table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e2e8f0; border-radius:8px; margin:0 0 20px;">
              <tr><td style="color:#64748b; font-size:12px;">Amount due</td>
                  <td align="right" style="color:#ea580c; font-size:22px; font-weight:800;">₹ {amt:,.0f}</td></tr>
              <tr><td colspan="2" style="border-top:1px solid #e2e8f0;"></td></tr>
              <tr><td style="color:#64748b; font-size:12px;">Invoice date</td>
                  <td align="right" style="color:#0f172a; font-size:13px;">{due_date}</td></tr>
              <tr><td style="color:#64748b; font-size:12px;">Reference</td>
                  <td align="right" style="color:#0f172a; font-size:13px; font-family:monospace;">{tid[:8].upper()}</td></tr>
            </table>
            <p style="color:#334155; font-size:13px; line-height:1.6; margin:0 0 8px;">
              If you have already made this payment, please disregard this reminder. Otherwise, kindly settle the amount at your earliest convenience.
            </p>
            <p style="color:#64748b; font-size:12px; margin-top:24px;">— {biz}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    """
    try:
        async with httpx.AsyncClient(timeout=30) as client_h:
            resp = await client_h.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={
                    "to": [email],
                    "subject": f"Payment reminder — ₹{amt:,.0f} for {project or 'your project'}",
                    "html": html,
                    "from_name": EMAIL_FROM_NAME,
                    "contact_email": user.get("email"),
                },
            )
        if resp.status_code >= 400:
            logger.error(f"Email send failed {resp.status_code}: {resp.text}")
            raise HTTPException(status_code=502, detail="Email provider rejected the send")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=502, detail=f"Send failed: {str(e)[:120]}")

    await db.transactions.update_one({"id": tid}, {"$set": {"last_reminder_at": now_iso()}})
    return {"ok": True, "sent_to": email}


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.transactions.create_index([("user_id", 1), ("date", -1)])
    await db.employees.create_index([("user_id", 1), ("name", 1)])
    await db.payouts.create_index([("user_id", 1), ("date", -1)])
    await db.tasks.create_index([("user_id", 1), ("date", 1)])
    await db.documents.create_index([("user_id", 1), ("created_at", -1)])

    # Seed admin/owner
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_pw:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "name": "Site Owner",
                "business_name": "SiteFlow Demo Co.",
                "password_hash": hash_password(admin_pw),
                "role": "owner",
                "created_at": now_iso(),
            })
            logger.info(f"Seeded admin: {admin_email}")
        elif not verify_password(admin_pw, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pw)}})
            logger.info(f"Updated admin password: {admin_email}")

    # Init storage
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@api.get("/")
async def root():
    return {"app": "SiteFlow Financials", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
