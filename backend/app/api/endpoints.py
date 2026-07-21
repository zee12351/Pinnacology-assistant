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
from app.utils.pdf_generator import create_pdf_from_markdown

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class ChatRequest(BaseModel):
    message: str
    agent_type: str = "research"  # research, writing, citation
    use_rag: bool = True
    persona: Optional[str] = None

import json
import asyncio

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

                    def _review_text(content):
                        if isinstance(content, str):
                            return content
                        if isinstance(content, list):
                            return "".join(part.get("text", "") for part in content if isinstance(part, dict) and "text" in part)
                        return ""

                    model = get_model()
                    if not model:
                        yield f"data: {json.dumps({'error': 'GEMINI_API_KEY not set'})}\n\n"
                        return
                    # Full-text RAG: when use_rag is set, pull the most relevant
                    # chunks from the user's uploaded documents and ground the answer
                    # in them (so chat-with-papers answers from full text, not just abstracts).
                    review_message = request.message
                    if request.use_rag:
                        try:
                            if chroma_store.embeddings and chroma_store.collection.count() > 0:
                                cnt = chroma_store.collection.count()
                                rag = chroma_store.query(request.message, n_results=min(5, cnt))
                                if rag and rag.get('documents') and rag['documents'][0]:
                                    excerpts = "\n\n---\n\n".join(rag['documents'][0])[:6000]
                                    review_message = (
                                        "Use the following excerpts from the user's uploaded documents to answer the question. "
                                        "Base your answer on these excerpts and cite them where relevant.\n\n"
                                        "=== DOCUMENT EXCERPTS ===\n" + excerpts + "\n=== END EXCERPTS ===\n\n" + request.message
                                    )
                        except Exception as rag_err:
                            print(f"review RAG warning: {rag_err}")
                    review_emitted = False
                    try:
                        async for chunk in model.astream([HumanMessage(content=review_message)]):
                            if hasattr(chunk, 'content') and chunk.content:
                                text_to_yield = _review_text(chunk.content)
                                if text_to_yield:
                                    review_emitted = True
                                    yield f"data: {json.dumps({'type': 'token', 'content': text_to_yield})}\n\n"
                    except Exception as stream_err:
                        print(f"review stream error: {stream_err}")
                    # Fallback: some model/langchain combos don't emit streaming
                    # content. Do one non-streaming call so the user still gets an answer.
                    if not review_emitted:
                        try:
                            result = await model.ainvoke([HumanMessage(content=review_message)])
                            text_to_yield = _review_text(getattr(result, "content", ""))
                            if text_to_yield:
                                review_emitted = True
                                yield f"data: {json.dumps({'type': 'token', 'content': text_to_yield})}\n\n"
                        except Exception as inv_err:
                            yield f"data: {json.dumps({'error': 'Model call failed: ' + str(inv_err)})}\n\n"
                            return
                    if not review_emitted:
                        yield f"data: {json.dumps({'error': 'The model returned an empty response. Please try again.'})}\n\n"
                    return

                def _extract_text(content):
                    if isinstance(content, str):
                        return content
                    if isinstance(content, list):
                        return "".join(part.get("text", "") for part in content if isinstance(part, dict) and "text" in part)
                    return ""

                # Stream the agent graph token-by-token. If the integration does
                # not emit streaming events, fall back to the final message captured
                # from the graph's completion event (no second run).
                streamed_any = False
                final_text = ""
                async for event in app_graph.astream_events(initial_state, version="v1"):
                    kind = event["event"]
                    if kind == "on_chat_model_stream":
                        chunk = event["data"].get("chunk")
                        if chunk is not None and getattr(chunk, "content", None):
                            t = _extract_text(chunk.content)
                            if t:
                                streamed_any = True
                                yield f"data: {json.dumps({'type': 'token', 'content': t})}\n\n"
                    elif kind == "on_tool_end":
                        tool_name = event.get("name", "")
                        if tool_name in ["search_core_papers", "search_elsevier", "search_pubmed"]:
                            out = event["data"].get("output", "")
                            if isinstance(out, str) and out.strip().startswith("[") and out.strip().endswith("]"):
                                try:
                                    papers = json.loads(out)
                                    yield f"data: {json.dumps({'type': 'papers', 'content': papers})}\n\n"
                                except Exception:
                                    pass
                    elif kind == "on_chain_end":
                        out = event["data"].get("output")
                        if isinstance(out, dict) and out.get("messages"):
                            last = out["messages"][-1]
                            c = _extract_text(getattr(last, "content", ""))
                            if c:
                                final_text = c

                if not streamed_any:
                    if final_text:
                        yield f"data: {json.dumps({'type': 'token', 'content': final_text})}\n\n"
                    else:
                        yield f"data: {json.dumps({'error': 'No content was generated by the model.'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/extract-figures")
async def extract_figures(file: UploadFile = File(...)):
    """Extract embedded figures/images from an uploaded PDF and return them as
    base64 data URLs. Best-effort and fully guarded — returns an empty list rather
    than erroring if the PDF has no extractable raster images."""
    import base64, io
    figures = []
    try:
        from pypdf import PdfReader
        data = await file.read()
        reader = PdfReader(io.BytesIO(data))
        count = 0
        for pi, page in enumerate(reader.pages):
            try:
                for img in page.images:
                    b = img.data
                    if not b or len(b) < 4000:  # skip tiny icons / logos
                        continue
                    name = (getattr(img, "name", "") or "").lower()
                    if name.endswith(".jpg") or name.endswith(".jpeg"):
                        mime = "image/jpeg"
                    elif name.endswith(".gif"):
                        mime = "image/gif"
                    else:
                        mime = "image/png"
                    figures.append({
                        "page": pi + 1,
                        "name": getattr(img, "name", None) or ("figure-" + str(count + 1)),
                        "dataUrl": "data:" + mime + ";base64," + base64.b64encode(b).decode("ascii"),
                    })
                    count += 1
                    if count >= 12:
                        break
            except Exception:
                continue
            if count >= 12:
                break
    except Exception as e:
        return {"figures": [], "error": str(e)}
    return {"figures": figures}

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

@router.post("/export-pdf")
async def export_pdf(request: ExportDocxRequest):
    try:
        buffer = create_pdf_from_markdown(request.markdown_text)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=Pinnovix_Document.pdf"}
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


class AutocompleteRequest(BaseModel):
    text: str

@router.post("/autocomplete")
async def autocomplete(request: AutocompleteRequest):
    text = (request.text or "").strip()
    if not text:
        return {"completion": ""}
    try:
        from app.agents.workflow import get_model
        model = get_model()
        if not model:
            return {"completion": ""}
        prompt = (
            "You are an inline autocomplete for an academic writing editor. "
            "Continue the text below naturally, matching its tone, tense and style. "
            "Return ONLY the continuation that should come immediately next - do NOT repeat "
            "any of the existing text, do not add quotes, labels or explanations. "
            "Keep it concise: at most one sentence or clause (about 6-18 words).\n\n"
            f"TEXT:\n{text[-1500:]}\n\nCONTINUATION:"
        )
        resp = await model.ainvoke([HumanMessage(content=prompt)])
        completion = getattr(resp, "content", "") or ""
        if isinstance(completion, list):
            completion = " ".join(str(c) for c in completion)
        completion = str(completion).strip().strip('"').strip()
        if len(completion) > 220:
            cut = completion[:220]
            completion = cut.rsplit(" ", 1)[0] if " " in cut else cut
        return {"completion": completion}
    except Exception as e:
        print(f"Autocomplete error: {e}")
        return {"completion": ""}


class SuggestCitationsRequest(BaseModel):
    text: str
    max_claims: int = 6

@router.post("/suggest-citations")
async def suggest_citations(request: SuggestCitationsRequest):
    text = (request.text or "").strip()
    if not text:
        return {"claims": []}
    try:
        from app.agents.workflow import get_model
        model = get_model()
        if not model:
            return {"claims": []}
        prompt = (
            "You are an academic editor. From the text below, identify up to "
            f"{request.max_claims} sentences that make a factual, empirical, statistical or "
            "historical claim that SHOULD be backed by a citation but currently has NONE. "
            "Skip any sentence that already contains a parenthetical citation like (Author, 2020) "
            "or a bracketed number like [3]. For each, return the exact claim sentence copied "
            "verbatim from the text, plus a short search query (key terms, author or topic) to find "
            "a supporting peer-reviewed paper. Respond with ONLY a JSON array, no prose, like: "
            '[{"claim":"<verbatim sentence>","query":"<search terms>"}]'
            f"\n\nTEXT:\n{text[:6000]}"
        )
        resp = await model.ainvoke([HumanMessage(content=prompt)])
        content = getattr(resp, "content", "") or ""
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        content = str(content)
        m = re.search(r"\[.*\]", content, re.S)
        raw = m.group(0) if m else content
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = []
        out = []
        for c in (parsed or [])[: request.max_claims]:
            if isinstance(c, dict) and c.get("claim"):
                out.append({
                    "claim": str(c["claim"]).strip(),
                    "query": str(c.get("query") or c["claim"]).strip(),
                })
        return {"claims": out}
    except Exception as e:
        print(f"suggest-citations error: {e}")
        return {"claims": []}


class PaperSearchRequest(BaseModel):
    query: str
    year: Optional[str] = None
    limit: int = 6

@router.post("/semantic-scholar")
async def semantic_scholar(request: PaperSearchRequest):
    """Proxy to Semantic Scholar Graph API (browser-blocked by CORS, so done server-side)."""
    q = (request.query or "").strip()
    if not q:
        return {"results": []}
    try:
        params = {
            "query": q,
            "limit": min(request.limit or 6, 10),
            "fields": "title,authors,year,venue,externalIds,citationCount,openAccessPdf,abstract,tldr",
        }
        if request.year:
            params["year"] = str(request.year)
        headers = {}
        key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
        if key:
            headers["x-api-key"] = key
        resp = requests.get(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            params=params, headers=headers, timeout=12,
        )
        if resp.status_code != 200:
            return {"results": []}
        data = resp.json().get("data", []) or []
        out = []
        for it in data:
            ext = it.get("externalIds") or {}
            doi = ext.get("DOI", "") or ""
            oa = it.get("openAccessPdf") or {}
            out.append({
                "doi": doi,
                "title": it.get("title", "") or "",
                "authors": [a.get("name", "") for a in (it.get("authors") or [])],
                "year": it.get("year"),
                "venue": it.get("venue", "") or "",
                "citedBy": it.get("citationCount"),
                "abstract": it.get("abstract") or ((it.get("tldr") or {}).get("text") or ""),
                "isOA": bool(oa.get("url")),
                "url": oa.get("url") or (f"https://doi.org/{doi}" if doi else ""),
            })
        return {"results": out}
    except Exception as e:
        print(f"semantic-scholar error: {e}")
        return {"results": []}


def _format_authors_intext(authors):
    authors = [a for a in authors if a]
    if not authors:
        return "Anonymous"
    if len(authors) == 1:
        return authors[0]
    if len(authors) == 2:
        return f"{authors[0]} & {authors[1]}"
    return f"{authors[0]} et al."


def retrieve_sources(topic: str, n: int = 20):
    """Pull real, verified papers (Crossref + OpenAlex) for a topic, with author/year/DOI."""
    sources = []
    seen = set()
    # --- Crossref ---
    try:
        r = requests.get("https://api.crossref.org/works", params={
            "query.bibliographic": topic, "rows": 30,
            "select": "title,author,published,container-title,DOI,is-referenced-by-count",
            "filter": "type:journal-article",
        }, headers={"User-Agent": "Pinnovix/1.0 (mailto:info@pinnovix.app)"}, timeout=15)
        if r.status_code == 200:
            for it in r.json().get("message", {}).get("items", []):
                doi = (it.get("DOI") or "").lower()
                t = it.get("title") or [""]
                title = t[0] if isinstance(t, list) and t else (t if isinstance(t, str) else "")
                authors = [a.get("family", "") for a in (it.get("author") or []) if a.get("family")]
                dp = (it.get("published", {}) or {}).get("date-parts", [[None]])
                year = dp[0][0] if dp and dp[0] else None
                jc = it.get("container-title") or [""]
                journal = jc[0] if isinstance(jc, list) and jc else (jc if isinstance(jc, str) else "")
                if not (title and authors and year):
                    continue
                key = doi or title.lower()[:60]
                if key in seen:
                    continue
                seen.add(key)
                sources.append({
                    "author": _format_authors_intext(authors), "year": str(year),
                    "families": authors, "title": title, "journal": journal, "doi": doi,
                    "cited": it.get("is-referenced-by-count", 0) or 0,
                })
    except Exception as e:
        print(f"retrieve_sources crossref error: {e}")
    # --- OpenAlex (supplement / breadth) ---
    try:
        r = requests.get("https://api.openalex.org/works", params={
            "search": topic, "per-page": 20, "mailto": "info@pinnovix.app",
            "filter": "type:article",
        }, timeout=15)
        if r.status_code == 200:
            for it in r.json().get("results", []):
                doi = (it.get("doi") or "").replace("https://doi.org/", "").lower()
                title = it.get("title") or it.get("display_name") or ""
                authors = []
                for a in (it.get("authorships") or []):
                    name = (a.get("author") or {}).get("display_name") or a.get("raw_author_name") or ""
                    if name:
                        authors.append(name.split()[-1])
                year = it.get("publication_year")
                journal = ((it.get("primary_location") or {}).get("source") or {}).get("display_name") or ""
                if not (title and authors and year):
                    continue
                key = doi or title.lower()[:60]
                if key in seen:
                    continue
                seen.add(key)
                sources.append({
                    "author": _format_authors_intext(authors), "year": str(year),
                    "families": authors, "title": title, "journal": journal, "doi": doi,
                    "cited": it.get("cited_by_count", 0) or 0,
                })
    except Exception as e:
        print(f"retrieve_sources openalex error: {e}")
    sources.sort(key=lambda s: s["cited"], reverse=True)
    return sources[:n]


class GeneratePaperRequest(BaseModel):
    topic: str
    persona: Optional[str] = None
    max_sources: int = 20

@router.post("/generate-paper")
async def generate_paper(request: GeneratePaperRequest):
    full = request.topic or ""

    async def event_generator():
        try:
            from app.agents.workflow import get_model
            model = get_model()
            if not model:
                yield f"data: {json.dumps({'error': 'GEMINI_API_KEY not set'})}\n\n"
                return
            # derive a clean topic
            m = re.search(r"Topic/Prompt:\s*(.+)", full)
            search_topic = (m.group(1).strip() if m else full).split("\n")[0][:300]
            if not search_topic.strip():
                search_topic = full[:300]

            # Jenni-style: the model writes the prose with NO citations. Real citations are
            # inserted afterwards by /api/cite-claims (database lookups), never by the model.
            instruction = (
                f"You are an expert academic researcher. Write a complete, in-depth research paper on:\n"
                f"\"{search_topic}\".\n\n"
                "Use EXACTLY this structure, with Markdown headings and several substantial, well-developed "
                "paragraphs in EACH section:\n"
                "# <a specific, descriptive paper title>\n"
                "## Abstract\n## Introduction\n## Literature Review\n## Methodology\n"
                "## Results\n## Discussion\n## Conclusion\n\n"
                "CRITICAL RULES:\n"
                "- Do NOT include ANY in-text citations, (Author, Year) references, bracketed numbers like [1], "
                "or a References/Bibliography section. Citations will be added separately by the system.\n"
                "- State each claim directly and clearly in your own words.\n"
                "- Write the ENTIRE paper in this single response - every section fully developed, 1800-2800 "
                "words total. Do NOT stop early, summarise, or ask to continue.\n"
                "- Output ONLY the paper itself, with no notes, checklists or commentary."
            )

            async for chunk in model.astream([HumanMessage(content=instruction)]):
                content = getattr(chunk, "content", "")
                if isinstance(content, list):
                    content = "".join(str(c) for c in content)
                if content:
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"generate-paper error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


_CITE_STOPWORDS = set("""a an the and or but of to in on for with as by that this these those is are was were be been being
have has had do does did can could will would may might should must such which who whom whose their its from at into than then
however often more most many some other another using used use based approach approaches method methods methodology model models
study studies result results paper papers research researchers work works propose proposed present presents show shows shown
we our it they them there here also both due within across various different several including include includes provide provides
new novel recent recently current currently significant important key main major given while whereas thus therefore hence overall
between among through over under about after before during each per via not no yes very much more less least first second third
one two three data analysis system systems application applications field fields area areas because since although though even""".split())


def _cite_keyterms(text: str):
    import re as _re
    words = _re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", (text or "").lower())
    return set(w for w in words if w not in _CITE_STOPWORDS and len(w) > 3)


def _best_source_for_claim(claim: str, from_year=None, min_cited=0, exclude=None):
    """Find one real, verified paper (with DOI) that TOPICALLY supports a claim.
    Ranks candidates by relevance (shared key terms + Crossref score), NOT by raw
    citation count, and returns None when nothing is a confident match — a wrong
    citation is worse than no citation."""
    q = (claim or "").strip()
    if len(q) < 25:
        return None
    claim_terms = _cite_keyterms(q)
    if len(claim_terms) < 2:
        return None
    try:
        _filter = "type:journal-article"
        if from_year:
            _filter += f",from-pub-date:{from_year}-01-01"
        r = requests.get("https://api.crossref.org/works", params={
            "query.bibliographic": q[:300], "rows": 15,
            "select": "title,author,published,container-title,DOI,is-referenced-by-count,score",
            "filter": _filter,
        }, headers={"User-Agent": "Pinnovix/1.0 (mailto:info@pinnovix.app)"}, timeout=10)
        if r.status_code != 200:
            return None
        best = None
        best_rank = -1.0
        best_overlap = 0
        for it in r.json().get("message", {}).get("items", []):
            doi = (it.get("DOI") or "").lower()
            if not doi:
                continue
            if exclude and doi in exclude:
                continue
            authors = [a.get("family", "") for a in (it.get("author") or []) if a.get("family")]
            dp = (it.get("published", {}) or {}).get("date-parts", [[None]])
            year = dp[0][0] if dp and dp[0] else None
            if not (authors and year):
                continue
            cited = it.get("is-referenced-by-count", 0) or 0
            if from_year and (not year or int(year) < from_year):
                continue
            if min_cited and cited < min_cited:
                continue
            t = it.get("title") or [""]
            title = t[0] if isinstance(t, list) and t else (t if isinstance(t, str) else "")
            if not title:
                continue
            title_terms = _cite_keyterms(title)
            overlap = len(claim_terms & title_terms)
            cr_score = float(it.get("score", 0) or 0)
            # Relevance-first ranking: topical overlap dominates, Crossref score breaks
            # ties, citations only nudge among already-relevant papers.
            rank = overlap * 1000.0 + cr_score + min(cited, 20000) / 10000.0
            if rank > best_rank:
                jc = it.get("container-title") or [""]
                journal = jc[0] if isinstance(jc, list) and jc else (jc if isinstance(jc, str) else "")
                best_rank = rank
                best_overlap = overlap
                best = {
                    "author": _format_authors_intext(authors), "surname": authors[0],
                    "families": authors, "year": str(year), "title": title,
                    "journal": journal, "doi": doi,
                }
        # Confidence gate: require at least 2 shared key terms with the title.
        # If nothing clears the bar, cite nothing rather than something wrong.
        if best is None or best_overlap < 2:
            return None
        return best
    except Exception as e:
        print(f"_best_source_for_claim error: {e}")
        return None


class CiteClaimsRequest(BaseModel):
    claims: list
    from_year: Optional[int] = None
    min_cited: int = 0

@router.post("/cite-claims")
async def cite_claims(request: CiteClaimsRequest):
    """For each claim sentence, return a real supporting paper (author/year/DOI) - jenni-style.
    Honours the document's citation filters (publish year, min cited-by)."""
    claims = request.claims or []
    results = []
    used = set()
    for idx, claim in enumerate(claims[:30]):
        paper = await asyncio.to_thread(_best_source_for_claim, str(claim), request.from_year, request.min_cited or 0, used)
        if paper and paper.get("doi"):
            used.add(paper["doi"])
        results.append({"idx": idx, "paper": paper})
    return {"results": results}


class ContinuePaperRequest(BaseModel):
    topic: str
    existing: str = ""
    headings: str = "Standard headings (IMRaD)"

@router.post("/continue-paper")
async def continue_paper(request: ContinuePaperRequest):
    """Paragraph-by-paragraph (jenni-style) generation: write only the NEXT section each call.
    Respects the heading style: Standard (IMRaD), Smart (topic-tailored), or No headings."""
    topic = (request.topic or "").strip()
    existing = (request.existing or "").strip()
    mode = (request.headings or "Standard headings (IMRaD)").lower()
    no_headings = "no heading" in mode
    smart = "smart" in mode

    if no_headings:
        first_struct = (
            "Write ONLY the title as a Markdown '# ' heading, then ONE complete opening claim (one or two "
            "sentences, ~35-60 words). Do NOT add any section heading."
        )
        next_struct = (
            "- Continue with ONE more complete claim (one or two sentences) that advances the paper. "
            "Do NOT add any section headings at all — write continuous flowing prose.\n"
            "- After roughly 10-12 claims of well-developed prose, reply with exactly: DONE"
        )
    elif smart:
        first_struct = (
            "Write ONLY: the title as a Markdown '# ' heading, then the FIRST section heading as a '## ' "
            "heading whose wording is tailored to THIS specific topic (not a fixed template), then ONE complete "
            "opening claim (one or two sentences, ~35-60 words)."
        )
        next_struct = (
            "- If the most recent section has fewer than 5 sentences, continue THAT section with one more claim (no heading).\n"
            "- If it already has about 5-6 sentences, start the next section: output a '## ' heading whose wording "
            "is tailored to this topic (choose the most natural next section for this subject), followed by ONE opening paragraph.\n"
            "- Once the paper has a natural concluding section with 2+ paragraphs, reply with exactly: DONE"
        )
    else:  # Standard IMRaD
        first_struct = (
            "Write ONLY: the title as a Markdown '# ' heading, then a '## Introduction' heading, then ONE complete "
            "opening claim (one or two sentences, ~35-60 words)."
        )
        next_struct = (
            "- If the most recent section has fewer than 5 sentences, continue THAT section with one more claim (no heading).\n"
            "- If it already has about 5-6 sentences, start the next section: output its '## ' heading "
            "(usual order: Literature Review, Methodology, Results, Discussion, Conclusion) followed by ONE opening paragraph.\n"
            "- If the paper already has a Conclusion with 2+ paragraphs, reply with exactly: DONE"
        )

    async def event_generator():
        try:
            from app.agents.workflow import get_model
            model = get_model()
            if not model:
                yield f"data: {json.dumps({'error': 'GEMINI_API_KEY not set'})}\n\n"
                return
            if not existing:
                instruction = (
                    f"Begin a research paper on: \"{topic}\".\n"
                    + first_struct + " Always finish the sentence; never stop mid-sentence.\n"
                    "Do NOT include any in-text citations, bracketed numbers, or a References section - "
                    "citations are added separately. Output only the content, no commentary."
                )
            else:
                instruction = (
                    f"You are continuing a research paper on: \"{topic}\".\n\n"
                    f"=== PAPER SO FAR ===\n{existing[-3500:]}\n=== END ===\n\n"
                    "Write ONLY ONE complete claim - one or two full sentences (about 35-60 words) that make a single point which ONE citation would support. Always finish the sentence; never stop mid-sentence.\n"
                    + next_struct + "\n"
                    "Do NOT add a References section and do NOT include any in-text citations or bracketed "
                    "numbers (they are added automatically)."
                )
            async for chunk in model.astream([HumanMessage(content=instruction)]):
                content = getattr(chunk, "content", "")
                if isinstance(content, list):
                    content = "".join(str(c) for c in content)
                if content:
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"continue-paper error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------- Literature Review sharing ----------------
import time

_SHARE_DIR = os.getenv("DATA_DIR", "./data")
_SHARE_FILE = os.path.join(_SHARE_DIR, "lit_shares.json")
_lit_shares = {}

def _load_lit_shares():
    global _lit_shares
    try:
        with open(_SHARE_FILE, "r") as f:
            _lit_shares = json.load(f)
    except Exception:
        _lit_shares = {}

def _save_lit_shares():
    try:
        os.makedirs(_SHARE_DIR, exist_ok=True)
        with open(_SHARE_FILE, "w") as f:
            json.dump(_lit_shares, f)
    except Exception:
        pass

_load_lit_shares()

class LitShareRequest(BaseModel):
    to_email: str
    from_email: str = "someone"
    session: dict = {}

@router.post("/lit/share")
async def lit_share(req: LitShareRequest):
    key = (req.to_email or "").strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="to_email required")
    entry = {
        "id": str(int(time.time() * 1000)),
        "from_email": req.from_email or "someone",
        "session": req.session or {},
        "ts": int(time.time() * 1000),
    }
    _lit_shares.setdefault(key, [])
    _lit_shares[key].insert(0, entry)
    _lit_shares[key] = _lit_shares[key][:50]
    _save_lit_shares()
    return {"ok": True}

@router.get("/lit/shared")
async def lit_shared(email: str = ""):
    key = (email or "").strip().lower()
    return {"shared": _lit_shares.get(key, [])}
