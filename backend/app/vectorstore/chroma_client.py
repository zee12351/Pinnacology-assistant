from typing import List
import os
from chromadb import PersistentClient
from langchain_google_genai import GoogleGenerativeAIEmbeddings

CHROMA_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")

class ChromaClient:
    def __init__(self):
        self.client = PersistentClient(path=CHROMA_PATH)
        self.collection = self.client.get_or_create_collection("research_papers")
        
        # Need API key for embeddings
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            self.embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=api_key)
        else:
            self.embeddings = None

    def add_documents(self, documents: List[str], metadatas: List[dict], ids: List[str]):
        if not self.embeddings:
            raise ValueError("GEMINI_API_KEY not set")
            
        embeddings = self.embeddings.embed_documents(documents)
        
        self.collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    def query(self, text: str, n_results: int = 5):
        if not self.embeddings:
            raise ValueError("GEMINI_API_KEY not set")
            
        query_embedding = self.embeddings.embed_query(text)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        return results

chroma_store = ChromaClient()
