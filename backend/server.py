from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
import hmac
from concurrent.futures import ThreadPoolExecutor
import asyncio
from dns_tool import analyze as dns_analyze
import imap_tool
import cpanel_tool


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

WORKSPACE_KEY = os.environ.get('WORKSPACE_KEY', '')


class KeyVerifyRequest(BaseModel):
    key: str


class KeyVerifyResponse(BaseModel):
    valid: bool


@api_router.get("/")
async def root():
    return {"message": "Flaviu Workspace API"}


@api_router.post("/auth/verify", response_model=KeyVerifyResponse)
async def verify_key(payload: KeyVerifyRequest):
    submitted = (payload.key or "").replace("-", "").strip()
    valid = bool(WORKSPACE_KEY) and hmac.compare_digest(submitted, WORKSPACE_KEY)
    return KeyVerifyResponse(valid=valid)


class DnsLookupRequest(BaseModel):
    domain: str


_executor = ThreadPoolExecutor(max_workers=4)


@api_router.post("/tools/dns-lookup")
async def dns_lookup(payload: DnsLookupRequest):
    raw = (payload.domain or "").strip().lower()
    raw = raw.replace("https://", "").replace("http://", "")
    domain = raw.split("/")[0].split("?")[0]
    if not domain or "." not in domain:
        return {"error": "Introdu un domeniu valid (ex: flaviu.dev)."}
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(_executor, dns_analyze, domain)
        return result
    except Exception as e:
        logger.exception("dns lookup failed")
        return {"error": f"Analiza DNS a eșuat: {e}"}


class ImapAccount(BaseModel):
    host: str
    port: int = 993
    email: str
    password: str
    ssl: bool = True


class ImapSyncRequest(BaseModel):
    source: ImapAccount
    dest: ImapAccount


@api_router.post("/tools/imap/test")
async def imap_test(account: ImapAccount):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, imap_tool.test_connection, account.model_dump())


@api_router.post("/tools/imap/start")
async def imap_start(payload: ImapSyncRequest):
    job_id = imap_tool.start_job(payload.source.model_dump(), payload.dest.model_dump())
    return {"job_id": job_id}


@api_router.get("/tools/imap/status/{job_id}")
async def imap_status(job_id: str):
    job = imap_tool.get_status(job_id)
    if not job:
        return {"error": "Job inexistent."}
    return {k: v for k, v in job.items() if k != "cancel"}


@api_router.post("/tools/imap/cancel/{job_id}")
async def imap_cancel(job_id: str):
    return {"cancelled": imap_tool.cancel_job(job_id)}


class CpanelAccount(BaseModel):
    host: str
    port: int = 21
    user: str
    password: str
    tls: bool = False


class CpanelStartRequest(BaseModel):
    source: CpanelAccount
    dest: CpanelAccount
    folders: list[str]


@api_router.post("/tools/cpanel/scan")
async def cpanel_scan(account: CpanelAccount):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, cpanel_tool.scan, account.model_dump())


@api_router.post("/tools/cpanel/start")
async def cpanel_start(payload: CpanelStartRequest):
    if not payload.folders:
        return {"error": "Selectează cel puțin un folder."}
    job_id = cpanel_tool.start_job(payload.source.model_dump(), payload.dest.model_dump(), payload.folders)
    return {"job_id": job_id}


@api_router.get("/tools/cpanel/status/{job_id}")
async def cpanel_status(job_id: str):
    job = cpanel_tool.get_status(job_id)
    if not job:
        return {"error": "Job inexistent."}
    return {k: v for k, v in job.items() if k != "cancel"}


@api_router.post("/tools/cpanel/cancel/{job_id}")
async def cpanel_cancel(job_id: str):
    return {"cancelled": cpanel_tool.cancel_job(job_id)}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
