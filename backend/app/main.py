import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

app = FastAPI(
    title="AI Research & Academic Writing Assistant API",
    description="Backend API for research paper analysis, writing assistance, and RAG operations.",
    version="1.0.0"
)

# Configure CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to the AI Research & Academic Writing Assistant API"}

from app.api.endpoints import router as api_router
app.include_router(api_router, prefix="/api")


