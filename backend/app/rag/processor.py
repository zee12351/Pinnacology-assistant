import pdfplumber
import os
import uuid
import docx
from typing import List
from app.vectorstore.chroma_client import chroma_store
from langchain_text_splitters import RecursiveCharacterTextSplitter

class DocumentProcessor:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )

    def extract_text(self, file_path: str, filename: str) -> tuple[str, str]:
        """Extracts text from a document and returns it."""
        try:
            full_text = ""
            ext = filename.lower().split('.')[-1]
            
            if ext == 'pdf':
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            full_text += text + "\n\n"
            elif ext == 'docx':
                doc = docx.Document(file_path)
                full_text = "\n".join([para.text for para in doc.paragraphs])
            elif ext in ['txt', 'md']:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    full_text = f.read()
            else:
                return "", f"Unsupported extension: {ext}"
            
            if not full_text.strip():
                return "", "Could not extract text from document. It might be a scanned image or empty."
                
            return full_text, ""
        except Exception as e:
            return "", str(e)

    def process_pdf(self, file_path: str, filename: str) -> tuple[bool, str]:
        """Extracts text from a document, chunks it, and stores it in ChromaDB."""
        try:
            full_text, error = self.extract_text(file_path, filename)
            if not full_text:
                return False, error
                
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
            return True, ""
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"Error processing document {filename}: {e}")
            return False, str(e)

processor = DocumentProcessor()
