from typing import TypedDict, Annotated, Sequence
import operator
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
import os
import requests

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    agent_type: str  # research, writing, citation
    context: str     # retrieved chunks
    persona: str     # writing persona

# Get Gemini model
def get_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return ChatGoogleGenerativeAI(
        model="gemini-flash-latest", 
        google_api_key=api_key,
        max_output_tokens=8192,
        max_retries=1,
        convert_system_message_to_human=True
    )

@tool
def search_core_papers(query: str) -> str:
    """Search for academic papers and research articles on CORE (core.ac.uk). Use this when the user asks for academic literature."""
    headers = {"Authorization": f"Bearer {os.getenv('CORE_API_KEY')}"}
    try:
        resp = requests.get("https://api.core.ac.uk/v3/search/works", params={"q": query, "limit": 5}, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return "No papers found."
        import json
        structured_results = []
        for r in results:
            authors = ', '.join([a.get('name', '') for a in r.get('authors', []) if isinstance(a, dict)])
            structured_results.append({
                "title": r.get('title'),
                "authors": authors,
                "abstract": r.get('abstract'),
                "url": r.get('downloadUrl') or r.get('sourceUrl'),
                "source": "CORE"
            })
        return json.dumps(structured_results)
    except Exception as e:
        return f"Error searching CORE API: {e}"

@tool
def search_elsevier(query: str) -> str:
    """Search for academic papers and medical research articles on Elsevier Scopus/Embase. Use this when the user asks for academic literature or medical records."""
    headers = {
        "X-ELS-APIKey": os.getenv("ELSEVIER_API_KEY"),
        "Accept": "application/json"
    }
    try:
        resp = requests.get("https://api.elsevier.com/content/search/scopus", params={"query": query, "count": 5}, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        entries = data.get("search-results", {}).get("entry", [])
        if not entries:
            return "[]"
        import json
        structured_results = []
        for r in entries:
            title = r.get('dc:title', 'No Title')
            creator = r.get('dc:creator', 'Unknown')
            pub_name = r.get('prism:publicationName', 'Unknown')
            doi = r.get('prism:doi', '')
            url = f"https://doi.org/{doi}" if doi else r.get('prism:url', '')
            structured_results.append({
                "title": title,
                "authors": creator,
                "abstract": pub_name, # Elsevier search api doesn't return abstract by default, so we put pub_name here
                "url": url,
                "source": "Elsevier"
            })
        return json.dumps(structured_results)
    except Exception as e:
        return f"Error searching Elsevier API: {e}"

import urllib.parse

@tool
def generate_image(prompt: str) -> str:
    """Generate an image based on the prompt. Use this tool whenever the user asks for a picture, drawing, or image. Provide a highly descriptive visual prompt. CRITICAL INSTRUCTION: Once this tool returns the markdown image link, you MUST include that EXACT markdown image link in your final response to the user so they can see the image! Do not just say 'I generated the image'."""
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?nologo=true"
    return f"![{prompt}]({url})"

@tool
def search_pubmed(query: str) -> str:
    """Search for medical and life sciences research papers on PubMed. Use this when the user asks for academic literature or medical records."""
    try:
        search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        search_resp = requests.get(search_url, params={"db": "pubmed", "term": query, "retmode": "json", "retmax": 5}, timeout=10)
        search_resp.raise_for_status()
        pmids = search_resp.json().get("esearchresult", {}).get("idlist", [])
        if not pmids:
            return "No papers found on PubMed."
            
        summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        summary_resp = requests.get(summary_url, params={"db": "pubmed", "id": ",".join(pmids), "retmode": "json"})
        summary_resp.raise_for_status()
        results = summary_resp.json().get("result", {})
        
        formatted = ""
        for pmid in pmids:
            paper = results.get(pmid, {})
            title = paper.get("title", "No Title")
            authors = ", ".join([a.get("name", "") for a in paper.get("authors", [])])
            pubdate = paper.get("pubdate", "")
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            formatted += f"Title: {title}\nAuthors: {authors}\nPublication Date: {pubdate}\nURL: {url}\n\n"
        return formatted
    except Exception as e:
        return f"Error searching PubMed API: {e}"

tools = [search_core_papers, search_elsevier, search_pubmed, generate_image]

def execute_tools(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    
    tool_messages = []
    for tool_call in last_message.tool_calls:
        if tool_call["name"] == "search_core_papers":
            result = search_core_papers.invoke(tool_call["args"])
            tool_messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))
        elif tool_call["name"] == "search_elsevier":
            result = search_elsevier.invoke(tool_call["args"])
            tool_messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))
        elif tool_call["name"] == "search_pubmed":
            result = search_pubmed.invoke(tool_call["args"])
            tool_messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))
        elif tool_call["name"] == "generate_image":
            result = generate_image.invoke(tool_call["args"])
            tool_messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))
            
    return {"messages": tool_messages}

def research_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [SystemMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    model_with_tools = model.bind_tools(tools)
    messages = state["messages"]
    context = state.get("context", "")
    
    from app.prompts.system_prompts import RESEARCH_AGENT_PROMPT
    
    persona = state.get("persona", "")
    if persona == "LITERATURE REVIEW":
        persona_instruction = "\n\nCRITICAL PERSONA INSTRUCTION:\nYou must strictly adopt the 'LITERATURE REVIEW' persona. Your ONLY job is to provide literature papers already present on research paper websites like PubMed, CORE, and Elsevier. Do NOT provide general chat, do not write code, and do not make up information. Use your tools to search for real papers, and return ONLY a formatted list of those real papers with their URLs."
    elif persona == "ACADEMIC WRITING":
        persona_instruction = "\n\nCRITICAL PERSONA INSTRUCTION:\nYou must strictly adopt the 'ACADEMIC WRITING' persona. Write a highly professional, rigorous, and neat academic research paper based on the provided prompt and constraints. CRITICAL: You MUST include realistic scholarly inline citations (e.g., (Smith et al., 2023, p. 45)) at the end of every factual claim or paragraph to exactly mimic rigorous academic writing. Output MUST be perfectly clean standard Markdown. You are highly encouraged to include relevant visual media. For placeholder photos or diagrams, output markdown image tags like `![Image Description](https://image.pollinations.ai/prompt/detailed-description-with-hyphens?width=800&height=400)`. For flowcharts, graphs, or structured diagrams, output them as code blocks using standard Mermaid syntax (```mermaid ... ```). ABSOLUTELY DO NOT use LaTeX formatting or math formulas (no $ or $$ symbols anywhere!). If you must express a formula or math symbol, spell it out in plain English text (e.g., 'H equals C squared' or use standard unicode). DO NOT use ASCII art, do not use '== PROJECT REPORT ==' style headers, do not include '[Page 1]' markers, and do not use text-based borders. Format tables using standard Markdown tables. Ensure the final output is publication-ready and strictly adheres to the requested citation style."
    else:
        persona_instruction = f"\n\nCRITICAL PERSONA INSTRUCTION:\nYou must strictly adopt the following persona and writing style: {persona}. Ensure your tone, vocabulary, and structure align perfectly with this persona." if persona else ""
    
    # We only inject the system prompt block if it's the first turn for this node 
    # to avoid double human messages. But langchain handles list of messages well.
    # To be safe, we just prepend SystemMessage, and let Gemini's convert_system_message_to_human=True handle it
    prompt = f"System Instructions:\n{RESEARCH_AGENT_PROMPT}{persona_instruction}\n\nContext:\n{context}"
    
    # If the last message is a ToolMessage, we don't need to inject the system instructions again
    if len(messages) > 0 and isinstance(messages[-1], ToolMessage):
        response = model_with_tools.invoke(list(messages))
    else:
        response = model_with_tools.invoke([SystemMessage(content=prompt)] + list(messages))
        
    return {"messages": [response]}

def should_continue_research(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END

def writing_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [HumanMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    messages = state["messages"]
    from app.prompts.system_prompts import WRITING_AGENT_PROMPT
    response = model.invoke([SystemMessage(content=f"System Instructions:\n{WRITING_AGENT_PROMPT}")] + list(messages))
    return {"messages": [response]}

def citation_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [HumanMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    messages = state["messages"]
    from app.prompts.system_prompts import CITATION_AGENT_PROMPT
    response = model.invoke([SystemMessage(content=f"System Instructions:\n{CITATION_AGENT_PROMPT}")] + list(messages))
    return {"messages": [response]}

def router(state: AgentState):
    return state["agent_type"]

# Build the graph
workflow = StateGraph(AgentState)

workflow.add_node("research", research_agent)
workflow.add_node("writing", writing_agent)
workflow.add_node("citation", citation_agent)
workflow.add_node("tools", execute_tools)

workflow.set_conditional_entry_point(
    router,
    {
        "research": "research",
        "writing": "writing",
        "citation": "citation"
    }
)

workflow.add_conditional_edges(
    "research",
    should_continue_research,
    {
        "tools": "tools",
        END: END
    }
)

workflow.add_edge("tools", "research")
workflow.add_edge("writing", END)
workflow.add_edge("citation", END)

app_graph = workflow.compile()
