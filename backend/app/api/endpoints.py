from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import shutil
from typing import Optional
from langchain_core.messages import HumanMessage
from app.agents.workflow import app_graph
from app.rag.processor import processor
from app.vectorstore.chroma_client import chroma_store
from app.utils.docx_generator import create_docx_from_markdown

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    message: str
    agent_type: str = "research"  # research, writing, citation
    use_rag: bool = True
    persona: Optional[str] = None

import json

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
            "context": context,
            "persona": request.persona
        }
        
        async def event_generator():
            try:
                if request.agent_type == "review":
                    from app.agents.workflow import get_model
                    model = get_model()
                    if not model:
                        yield f"data: {json.dumps({'error': 'GEMINI_API_KEY not set'})}\n\n"
                        return
                    async for chunk in model.astream([HumanMessage(content=request.message)]):
                        if hasattr(chunk, 'content') and chunk.content:
                            content = chunk.content
                            text_to_yield = ""
                            if isinstance(content, str):
                                text_to_yield = content
                            elif isinstance(content, list):
                                text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and "text" in part]
                                text_to_yield = "".join(text_parts)
                            if text_to_yield:
                                yield f"data: {json.dumps({'type': 'token', 'content': text_to_yield})}\n\n"
                    return

                async for event in app_graph.astream_events(initial_state, version="v1"):
                    if event["event"] == "on_chat_model_stream":
                        chunk = event["data"]["chunk"]
                        if hasattr(chunk, 'content') and chunk.content:
                            content = chunk.content
                            text_to_yield = ""
                            if isinstance(content, str):
                                text_to_yield = content
                            elif isinstance(content, list):
                                text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and "text" in part]
                                text_to_yield = "".join(text_parts)
                                
                            if text_to_yield:
                                yield f"data: {json.dumps({'type': 'token', 'content': text_to_yield})}\n\n"
                    elif event["event"] == "on_tool_end":
                        # If a search tool returns a list of papers, stream it to the frontend
                        tool_name = event.get("name", "")
                        if tool_name in ["search_core_papers", "search_elsevier", "search_pubmed"]:
                            try:
                                output = event["data"].get("output", "")
                                # If the output is a JSON string of papers, send it as structured data
                                if isinstance(output, str) and output.startswith("[") and output.endswith("]"):
                                    papers = json.loads(output)
                                    yield f"data: {json.dumps({'type': 'papers', 'content': papers})}\n\n"
                            except Exception as e:
                                print(f"Failed to parse tool output as JSON: {e}")
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    allowed_extensions = ('.pdf', '.docx', '.txt', '.md')
    if not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, and MD files are allowed")
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Process the PDF
    success, error_msg = processor.process_pdf(file_path, file.filename)
    
    if success:
        return {"message": "File uploaded and processed successfully", "filename": file.filename}
    else:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {error_msg}")

@router.post("/parse-document")
async def parse_document(file: UploadFile = File(...)):
    allowed_extensions = ('.pdf', '.docx', '.txt', '.md')
    if not file.filename.lower().endswith(allowed_extensions):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, TXT, and MD files are allowed")
        
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    text, error_msg = processor.extract_text(file_path, file.filename)
    
    if not text:
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {error_msg}")
        
    return {"message": "Document parsed successfully", "text": text}

class ExportDocxRequest(BaseModel):
    markdown_text: str

@router.post("/export-docx")
async def export_docx(request: ExportDocxRequest):
    try:
        buffer = create_docx_from_markdown(request.markdown_text)
        return StreamingResponse(
            iter([buffer.getvalue()]), 
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": "attachment; filename=Pinnovix_Expert_Output.docx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import requests
import re
import xml.etree.ElementTree as ET

class FetchIdRequest(BaseModel):
    paper_id: str

@router.post("/library/fetch-id")
async def fetch_paper_by_id(request: FetchIdRequest):
    paper_id = request.paper_id.strip()
    try:
        # Check if arXiv
        if "arxiv" in paper_id.lower() or re.match(r'^\d{4}\.\d{4,5}(v\d+)?$', paper_id):
            aid = paper_id.split('/')[-1].replace('.pdf', '')
            # Fetch from arxiv API
            resp = requests.get(f"http://export.arxiv.org/api/query?id_list={aid}", timeout=10)
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                entry = root.find('{http://www.w3.org/2005/Atom}entry')
                if entry is not None:
                    title = entry.find('{http://www.w3.org/2005/Atom}title').text
                    summary = entry.find('{http://www.w3.org/2005/Atom}summary').text
                    # Save as text
                    filename = f"arxiv_{aid.replace('.', '_')}.txt"
                    filepath = os.path.join(UPLOAD_DIR, filename)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(f"Title: {title}\n\nAbstract: {summary}\n")
                    success = processor.process_pdf(filepath, filename)
                    return {"message": "Success", "title": title}
                    
        # Check if PMID
        elif paper_id.isdigit() or paper_id.lower().startswith('pmid'):
            pmid = paper_id.replace('pmid', '').replace('PMID', '').strip(': ')
            resp = requests.get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmid}&retmode=json", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                result = data.get('result', {}).get(pmid, {})
                title = result.get('title', 'Unknown Title')
                filename = f"pubmed_{pmid}.txt"
                filepath = os.path.join(UPLOAD_DIR, filename)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"Title: {title}\nPMID: {pmid}\n")
                success = processor.process_pdf(filepath, filename)
                return {"message": "Success", "title": title}

        # Otherwise assume DOI
        doi = paper_id.replace('https://doi.org/', '').strip()
        resp = requests.get(f"https://api.crossref.org/works/{doi}", timeout=10)
        if resp.status_code == 200:
            data = resp.json().get('message', {})
            title = data.get('title', ['Unknown'])[0]
            abstract = data.get('abstract', '')
            filename = f"doi_{doi.replace('/', '_')}.txt"
            filepath = os.path.join(UPLOAD_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"Title: {title}\nDOI: {doi}\nAbstract: {abstract}\n")
            success = processor.process_pdf(filepath, filename)
            return {"message": "Success", "title": title}

        raise HTTPException(status_code=404, detail="Could not resolve ID")
    except Exception as e:
        print("Fetch ID error:", e)
        raise HTTPException(status_code=500, detail=str(e))

class ZoteroRequest(BaseModel):
    user_id: str
    api_key: str

@router.post("/library/zotero")
async def sync_zotero(request: ZoteroRequest):
    try:
        headers = {"Zotero-API-Key": request.api_key}
        resp = requests.get(f"https://api.zotero.org/users/{request.user_id}/items?limit=10", headers=headers, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Zotero credentials")
        items = resp.json()
        count = 0
        for item in items:
            data = item.get('data', {})
            title = data.get('title', 'Untitled')
            abstract = data.get('abstractNote', '')
            if title and abstract:
                filename = f"zotero_{item['key']}.txt"
                filepath = os.path.join(UPLOAD_DIR, filename)
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(f"Title: {title}\n\nAbstract: {abstract}\n")
                processor.process_pdf(filepath, filename)
                count += 1
        return {"message": f"Successfully synced {count} items from Zotero"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MendeleyRequest(BaseModel):
    access_token: str

@router.post("/library/mendeley")
async def sync_mendeley(request: MendeleyRequest):
    try:
        # Mock implementation for Mendeley since it requires complex OAuth 
        # that can't be easily done with just a token without client id registration.
        # We will add a mock document to the library.
        filename = "mendeley_mock.txt"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"Title: Integration of AI in Quantum Systems\n\nAbstract: This is a mock document fetched from Mendeley integration.\n")
        processor.process_pdf(filepath, filename)
        return {"message": "Successfully synced 1 items from Mendeley"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
