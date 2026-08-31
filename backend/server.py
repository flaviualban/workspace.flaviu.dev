from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
import hmac


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
