"""Regenerate GUIDA_UTENTE.pdf from Markdown (requires reportlab and DejaVu fonts)."""
from pathlib import Path
from html import escape
import json
import os
import re
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
FONT = Path(os.environ.get('SFMCFIX_GUIDE_FONT_DIR', '/usr/share/fonts/truetype/dejavu'))
for name, file in [('Guide', 'DejaVuSans.ttf'), ('GuideBold', 'DejaVuSans-Bold.ttf'), ('GuideMono', 'DejaVuSansMono.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT / file)))
pdfmetrics.registerFontFamily('Guide', normal='Guide', bold='GuideBold', italic='Guide', boldItalic='GuideBold')
styles = {
    'body': ParagraphStyle('body', fontName='Guide', fontSize=9, leading=14, spaceAfter=7, splitLongWords=True),
    'title': ParagraphStyle('title', fontName='GuideBold', fontSize=20, leading=25, spaceAfter=14),
    'h2': ParagraphStyle('h2', fontName='GuideBold', fontSize=14, leading=19, spaceBefore=14, spaceAfter=8, keepWithNext=True),
    'h3': ParagraphStyle('h3', fontName='GuideBold', fontSize=11, leading=16, spaceBefore=10, spaceAfter=6, keepWithNext=True),
    'list': ParagraphStyle('list', fontName='Guide', fontSize=9, leading=14, leftIndent=13, firstLineIndent=-10, spaceAfter=5),
}
def inline(text):
    text = escape(text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<link href="\2" color="#0062a8">\1</link>', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    return re.sub(r'`([^`]+)`', r'<font name="GuideMono" size="8">\1</font>', text)

story, pending, table = [], [], []
def flush():
    if pending:
        story.append(Paragraph(inline(' '.join(pending)), styles['body'])); pending.clear()
def flush_table():
    if table:
        rows = [[Paragraph(inline(cell), styles['body']) for cell in row] for row in table]
        obj = Table(rows, colWidths=[155, 355], repeatRows=1, hAlign='LEFT')
        obj.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9f0f7')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.5,colors.HexColor('#72869b')),('BOTTOMPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),6)]))
        story.append(obj); story.append(Spacer(1, 10)); table.clear()
for line in (ROOT / 'GUIDA_UTENTE.md').read_text(encoding='utf-8').splitlines():
    if line.startswith('|'):
        flush()
        if not re.match(r'^\|[\s:|-]+\|$', line): table.append([c.strip() for c in line.strip('|').split('|')])
        continue
    flush_table()
    if not line.strip(): flush(); continue
    if line.startswith('#'):
        flush(); level = len(line) - len(line.lstrip('#'))
        story.append(Paragraph(inline(line.lstrip('#').strip()), styles['title' if level == 1 else 'h2' if level == 2 else 'h3']))
    elif re.match(r'^(\d+\.|-) ', line):
        flush(); story.append(Paragraph(inline(line), styles['list']))
    else: pending.append(line)
flush(); flush_table()
def footer(canvas, doc):
    canvas.setFont('Guide', 8); canvas.setFillColor(colors.HexColor('#526477'))
    canvas.drawString(42, 24, f'SFMC UI Fixer · Guida utente {VERSION}')
    canvas.drawRightString(A4[0]-42, 24, str(doc.page))
SimpleDocTemplate(str(ROOT / 'GUIDA_UTENTE.pdf'), pagesize=A4, rightMargin=42, leftMargin=42, topMargin=38, bottomMargin=42, title=f'SFMC UI Fixer {VERSION} — Guida utente', author='Francesco Trepiccioni').build(story, onFirstPage=footer, onLaterPages=footer)
