from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import re
import io

def parse_inline_markdown(paragraph, text):
    """
    Parses **bold** and *italic* markdown tags within a string and adds formatted runs to a paragraph.
    """
    # Simple regex to tokenize string into text, bold, and italic parts
    # It splits the string keeping the delimiters so we can identify them
    # Pattern looks for **text** or *text*
    tokens = re.split(r'(\*\*.*?\*\*|\*.*?\*)', text)
    
    for token in tokens:
        if not token:
            continue
        if token.startswith('**') and token.endswith('**'):
            run = paragraph.add_run(token[2:-2])
            run.bold = True
        elif token.startswith('*') and token.endswith('*'):
            run = paragraph.add_run(token[1:-1])
            run.italic = True
        else:
            paragraph.add_run(token)

def create_docx_from_markdown(markdown_text: str) -> io.BytesIO:
    """
    Converts markdown text to a highly formatted MS Word Document.
    Returns a BytesIO object containing the .docx file.
    """
    doc = Document()
    
    # Set default font to Times New Roman for an academic/expert look
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Times New Roman'
    font.size = Pt(12)
    
    # Process line by line
    lines = markdown_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Headings
        if line.startswith('# '):
            p = doc.add_heading('', level=1)
            parse_inline_markdown(p, line[2:])
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif line.startswith('## '):
            p = doc.add_heading('', level=2)
            parse_inline_markdown(p, line[3:])
        elif line.startswith('### '):
            p = doc.add_heading('', level=3)
            parse_inline_markdown(p, line[4:])
        # Bullet Points
        elif line.startswith('- ') or line.startswith('* '):
            p = doc.add_paragraph('', style='List Bullet')
            parse_inline_markdown(p, line[2:])
        # Numbered Lists (basic detection)
        elif re.match(r'^\d+\.\s', line):
            p = doc.add_paragraph('', style='List Number')
            # Extract the text after the number
            content = re.sub(r'^\d+\.\s', '', line)
            parse_inline_markdown(p, content)
        # Blockquotes
        elif line.startswith('> '):
            p = doc.add_paragraph('', style='Quote')
            parse_inline_markdown(p, line[2:])
        # Regular Paragraph
        else:
            p = doc.add_paragraph('')
            parse_inline_markdown(p, line)
            
    # Save to a memory buffer
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    
    return buffer
