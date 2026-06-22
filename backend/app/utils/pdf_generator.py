from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
import re
import io


def _strip_page_markers(text: str) -> str:
    text = re.sub(r'(?im)^\s*[_*]{0,2}\s*Page\s*\d+\s*[_*]{0,2}\s*$', '', text)
    text = re.sub(r'(?i)[_*]{1,2}\s*Page\s*\d+\s*[_*]{1,2}', '', text)
    return text


def _inline(text: str) -> str:
    """Convert basic markdown inline formatting to ReportLab markup (and escape XML)."""
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    text = re.sub(r'\[(.+?)\]\((https?://[^)]+)\)', r'<a href="\2" color="blue">\1</a>', text)
    return text


def _page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 9)
    # bottom-left page number
    canvas.drawString(0.75 * inch, 0.5 * inch, str(doc.page))
    canvas.restoreState()


def create_pdf_from_markdown(markdown_text: str) -> io.BytesIO:
    """Render markdown to a clean academic PDF with bottom-left page numbers."""
    text = _strip_page_markers(markdown_text or '')
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
        title="Pinnovix Document",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1c', parent=styles['Heading1'], alignment=TA_CENTER, fontName='Times-Bold', spaceAfter=14)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Times-Bold', spaceBefore=10, spaceAfter=6)
    h3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName='Times-Bold', spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle('Body', parent=styles['Normal'], fontName='Times-Roman', fontSize=12, leading=16, spaceAfter=8, alignment=TA_JUSTIFY)
    bullet = ParagraphStyle('Bullet', parent=body, leftIndent=18, spaceAfter=4)
    ref = ParagraphStyle('Ref', parent=body, leftIndent=24, firstLineIndent=-24, spaceAfter=6, alignment=0)

    flow = []
    in_refs = False
    for raw in text.split('\n'):
        line = raw.strip()
        if not line:
            continue
        if line.startswith('# '):
            flow.append(Paragraph(_inline(line[2:]), h1)); in_refs = False
        elif line.startswith('## '):
            heading = line[3:]
            in_refs = 'reference' in heading.lower() or 'bibliograph' in heading.lower()
            flow.append(Paragraph(_inline(heading), h2))
        elif line.startswith('### '):
            flow.append(Paragraph(_inline(line[4:]), h3))
        elif line.startswith('- ') or line.startswith('* '):
            flow.append(Paragraph('&bull;&nbsp;' + _inline(line[2:]), bullet))
        elif re.match(r'^\d+\.\s', line):
            flow.append(Paragraph(_inline(line), ref if in_refs else body))
        elif line.startswith('> '):
            flow.append(Paragraph(_inline(line[2:]), styles['Italic']))
        else:
            flow.append(Paragraph(_inline(line), ref if in_refs else body))

    if not flow:
        flow.append(Paragraph('', body))

    doc.build(flow, onFirstPage=_page_number, onLaterPages=_page_number)
    buf.seek(0)
    return buf
