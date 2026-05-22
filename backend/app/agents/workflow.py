from typing import TypedDict, Annotated, Sequence
import operator
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
import os

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    agent_type: str  # research, writing, citation
    context: str     # retrieved chunks

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

def research_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [SystemMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    messages = state["messages"]
    context = state.get("context", "")
    
    from app.prompts.system_prompts import RESEARCH_AGENT_PROMPT
    
    prompt = f"System Instructions:\n{RESEARCH_AGENT_PROMPT}\n\nContext:\n{context}"
    response = model.invoke([HumanMessage(content=prompt)] + list(messages))
    return {"messages": [response]}

def writing_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [HumanMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    messages = state["messages"]
    
    from app.prompts.system_prompts import WRITING_AGENT_PROMPT
    
    response = model.invoke([HumanMessage(content=f"System Instructions:\n{WRITING_AGENT_PROMPT}")] + list(messages))
    return {"messages": [response]}

def citation_agent(state: AgentState):
    model = get_model()
    if not model:
        return {"messages": [HumanMessage(content="Error: GEMINI_API_KEY not set.")]}
        
    messages = state["messages"]
    
    from app.prompts.system_prompts import CITATION_AGENT_PROMPT
    
    response = model.invoke([HumanMessage(content=f"System Instructions:\n{CITATION_AGENT_PROMPT}")] + list(messages))
    return {"messages": [response]}

def router(state: AgentState):
    return state["agent_type"]

# Build the graph
workflow = StateGraph(AgentState)

workflow.add_node("research", research_agent)
workflow.add_node("writing", writing_agent)
workflow.add_node("citation", citation_agent)

workflow.set_conditional_entry_point(
    router,
    {
        "research": "research",
        "writing": "writing",
        "citation": "citation"
    }
)

workflow.add_edge("research", END)
workflow.add_edge("writing", END)
workflow.add_edge("citation", END)

app_graph = workflow.compile()
