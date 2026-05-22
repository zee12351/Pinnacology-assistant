from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import os
import shutil
from typing import Optional
from langchain_core.messages import HumanMessage
from app.agents.workflow import app_graph
from app.rag.processor import processor
from app.vectorstore.chroma_client import chroma_store

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    message: str
    agent_type: str = "research"  # research, writing, citation
    use_rag: bool = True

@router.post("/chat")
async def chat(request: ChatRequest):
    try:
        context = ""
        if request.use_rag and request.agent_type == "research":
            try:
                # Safely query only if there are documents and key is set
                if chroma_store.embeddings:
                    count = chroma_store.collection.count()
                    if count > 0:
                        results = chroma_store.query(request.message, n_results=min(3, count))
                        if results and results['documents'] and len(results['documents']) > 0:
                            context = "\n\n".join(results['documents'][0])
            except Exception as e:
                print(f"RAG query warning: {e}")
                
        initial_state = {
            "messages": [HumanMessage(content=request.message)],
            "agent_type": request.agent_type,
            "context": context
        }
        
        result = app_graph.invoke(initial_state)
        
        response_message = result["messages"][-1].content
        
        return {"response": response_message}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Process the PDF
    success = processor.process_pdf(file_path, file.filename)
    
    if success:
        return {"message": "File uploaded and processed successfully", "filename": file.filename}
    else:
        raise HTTPException(status_code=500, detail="Failed to process PDF")
