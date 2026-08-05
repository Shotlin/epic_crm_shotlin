from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "epic-bos-india-tax-invoice.pdf"

OXBLOOD = colors.HexColor("#812F3B")
DEEP = colors.HexColor("#471722")
TEAL = colors.HexColor("#196A68")
GOLD = colors.HexColor("#BD8B3C")
INK = colors.HexColor("#182326")
MUTED = colors.HexColor("#657276")
LINE = colors.HexColor("#D8DDDB")
PAPER = colors.HexColor("#FBF8F1")
PALE = colors.HexColor("#F3F5F3")


def money(value: float) -> str:
    return f"Rs {value:,.2f}"


def page_frame(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(DEEP)
    canvas.rect(0, height - 4 * mm, width * .58, 4 * mm, stroke=0, fill=1)
    canvas.setFillColor(TEAL)
    canvas.rect(width * .58, height - 4 * mm, width * .42, 4 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.line(17 * mm, 15 * mm, width - 17 * mm, 15 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(17 * mm, 10 * mm, "Epic BOS Revenue Ledger - controlled document receipt")
    page = f"Page {doc.page}"
    canvas.drawString(width - 17 * mm - stringWidth(page, "Helvetica", 7), 10 * mm, page)
    canvas.restoreState()


def build():
    styles = getSampleStyleSheet()
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=INK)
    small = ParagraphStyle("Small", parent=body, fontSize=7.1, leading=9.5, textColor=MUTED)
    label = ParagraphStyle("Label", parent=small, fontName="Helvetica-Bold", fontSize=6.5, leading=8, textColor=MUTED, spaceAfter=3)
    right = ParagraphStyle("Right", parent=body, alignment=TA_RIGHT)
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=25, textColor=DEEP, alignment=TA_RIGHT)
    brand = ParagraphStyle("Brand", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=DEEP)
    eyebrow = ParagraphStyle("Eyebrow", parent=label, textColor=OXBLOOD, fontSize=7.2, leading=9)

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=17 * mm, rightMargin=17 * mm,
        topMargin=15 * mm, bottomMargin=22 * mm, title="Epic BOS India Tax Invoice",
        author="Epic BOS Revenue Ledger", subject="Controlled India tax invoice sample",
    )
    story = []

    mast = Table([
        [Paragraph("REVENUE LEDGER / INDIA", eyebrow), Paragraph("TAX INVOICE", title)],
        [Paragraph("Epic BOS India", brand), Paragraph("INV-26-27-00001", ParagraphStyle("InvoiceNo", parent=right, fontName="Helvetica-Bold", fontSize=10, textColor=OXBLOOD))],
        [Paragraph("Epic BOS India Private Limited<br/>27, Maker Tower, Lower Parel, Mumbai, Maharashtra 400013<br/><b>GSTIN:</b> 27ABCDE1234F1Z5", small), Paragraph("ORIGINAL FOR RECIPIENT<br/><font color='#196A68'><b>ISSUED</b></font>", right)],
    ], colWidths=[106 * mm, 70 * mm])
    mast.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, -1), (-1, -1), .7, OXBLOOD),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    story += [mast, Spacer(1, 5 * mm)]

    parties = Table([
        [Paragraph("BILL TO / RECIPIENT", label), Paragraph("SUPPLY CONTROL", label)],
        [Paragraph("Sahyadri Distribution Network Private Limited", ParagraphStyle("Party", parent=body, fontName="Helvetica-Bold", fontSize=10.5)), Paragraph("Invoice date: <b>15 July 2026</b><br/>Due date: <b>14 August 2026</b><br/>Payment terms: <b>NET30</b>", body)],
        [Paragraph("45, Commerce Park, Baner, Pune, Maharashtra 411045<br/><b>GSTIN:</b> 27AAECS1234K1Z2<br/><b>Place of supply:</b> Maharashtra / 27", small), Paragraph("Sales order: <b>SO-26-27-00001</b><br/>Currency: <b>INR</b><br/>Reverse charge: <b>No</b>", small)],
    ], colWidths=[96 * mm, 80 * mm])
    parties.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [parties, Spacer(1, 5 * mm)]

    rows = [["#", "DESCRIPTION / SAC", "QTY", "RATE", "TAXABLE", "GST"]]
    rows.append([
        "1",
        Paragraph("<b>Distributor operations platform - design acceptance milestone</b><br/><font color='#657276'>SAC 998314 / 25% milestone / Acceptance: ACC-2026-0715</font>", body),
        "1",
        money(1_200_000),
        money(1_200_000),
        "18%",
    ])
    lines = Table(rows, colWidths=[8 * mm, 72 * mm, 12 * mm, 29 * mm, 35 * mm, 20 * mm], repeatRows=1)
    lines.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DEEP), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 6.5),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), .6, LINE), ("LINEBELOW", (0, 1), (-1, -1), .6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story += [lines, Spacer(1, 5 * mm)]

    tax_words = Table([
        [Paragraph("TAX BREAKDOWN", label), ""],
        [Paragraph("CGST @ 9%", small), Paragraph(money(108_000), right)],
        [Paragraph("SGST @ 9%", small), Paragraph(money(108_000), right)],
        [Paragraph("Total tax", body), Paragraph(f"<b>{money(216_000)}</b>", right)],
    ], colWidths=[47 * mm, 38 * mm])
    tax_words.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE), ("SPAN", (0, 0), (-1, 0)),
        ("LINEBELOW", (0, 1), (-1, -1), .45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    total = Table([
        ["Taxable value", money(1_200_000)],
        ["CGST", money(108_000)],
        ["SGST", money(108_000)],
        [Paragraph("<b>AMOUNT DUE</b>", body), Paragraph(f"<b>{money(1_416_000)}</b>", ParagraphStyle("Grand", parent=right, fontSize=11, textColor=DEEP))],
    ], colWidths=[47 * mm, 44 * mm])
    total.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("TEXTCOLOR", (0, 0), (-1, -2), MUTED),
        ("FONTNAME", (0, 0), (-1, -2), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -2), 7.5),
        ("LINEBELOW", (0, 0), (-1, -2), .5, LINE), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F3E9E8")),
        ("BOX", (0, -1), (-1, -1), .7, OXBLOOD),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    split = Table([[tax_words, total]], colWidths=[85 * mm, 91 * mm])
    split.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [split, Spacer(1, 5 * mm)]

    words = Table([[Paragraph("<b>Amount in words:</b> Rupees fourteen lakh sixteen thousand only.", body)]], colWidths=[176 * mm])
    words.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("BACKGROUND", (0, 0), (-1, -1), PALE), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    story += [words, Spacer(1, 5 * mm)]

    boundary = Table([[Paragraph("<b>E-invoice boundary</b><br/>IRP status: Required review. Epic BOS has issued this controlled business document and created the receivable and balanced journal. IRN/QR registration remains a separate authorised IRP exchange and must not be inferred from PDF generation.", body)]], colWidths=[176 * mm])
    boundary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF7E7")),
        ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [boundary, Spacer(1, 5 * mm)]

    signature = Table([
        [Paragraph("BANK / COLLECTION REFERENCE", label), Paragraph("FOR EPIC BOS INDIA PRIVATE LIMITED", label)],
        [Paragraph("Account ending 4421<br/>IFSC: HDFC0000123<br/>Reference: INV-26-27-00001", small), Paragraph("Digitally governed issue<br/><br/><b>Authorised Signatory</b>", right)],
    ], colWidths=[92 * mm, 84 * mm])
    signature.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [signature]

    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)


if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    build()
    print(OUTPUT)
