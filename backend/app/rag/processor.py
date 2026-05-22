import pdfplumber
import os
import uuid
from typing import List
from app.vectorstore.chroma_client import chroma_store
from langchain.text_splitter import RecursiveCharacterTextSplitter

class DocumentProcessor:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )

    def process_pdf(self, file_path: str, filename: str) -> bool:
        """Extracts text from a PDF, chunks it, and stores it in ChromaDB."""
        try:
            full_text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        full_text += text + "\n\n"
            
            if not full_text.strip():
                return False
                
            chunks = self.text_splitter.split_text(full_text)
            
            documents = []
            metadatas = []
            ids = []
            
            doc_id = str(uuid.uuid4())
            
            for i, chunk in enumerate(chunks):
                documents.append(chunk)
                metadatas.append({"source": filename, "chunk": i, "doc_id": doc_id})
                ids.append(f"{doc_id}_{i}")
                
            chroma_store.add_documents(documents, metadatas, ids)
            return True
            
        except Exception as e:
            print(f"Error processing document: {e}")
            return False

processor = DocumentProcessor()
