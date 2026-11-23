"""Typeset a story collection as a book-sized PDF (the same page size as the other
BookWise reading editions), so the page reader and the AI Reader can use it too."""
from __future__ import annotations

import os
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTFont
from fpdf import FPDF

from app.stories.text import Story

PAGE_SIZE = (382.68, 581.1)  # points, about 13.5 x 20.5 cm
MARGIN_X = 40
MARGIN_TOP = 52
MARGIN_BOTTOM = 50
BODY_SIZE = 10.8
LINE_HEIGHT = 15.6

# Georgia ships with Windows; set STORY_PDF_FONT_DIR to use another regular/bold/italic TTF set.
DEFAULT_FONTS = {"": "georgia.ttf", "B": "georgiab.ttf", "I": "georgiai.ttf"}


def _font_dir() -> Path:
    return Path(os.environ.get("STORY_PDF_FONT_DIR") or Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts")


class _Book(FPDF):
    def __init__(self, title: str, supported: set[int]):
        super().__init__(unit="pt", format=PAGE_SIZE)
        self.book_title = title
        self.supported = supported

    def safe(self, text: str) -> str:
        """Replace letters the font lacks with their plain form (ṇ -> n)."""
        if all(ord(ch) in self.supported for ch in text):
            return text
        out = []
        for ch in text:
            if ord(ch) in self.supported or ch == "\n":
                out.append(ch)
                continue
            plain = "".join(c for c in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(c))
            out.append(plain if plain and all(ord(c) in self.supported for c in plain) else "")
        return "".join(out)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Body", "I", 8.5)
        self.set_text_color(120, 110, 100)
        self.set_y(24)
        self.cell(0, 10, self.safe(self.book_title), align="C")
        self.set_text_color(30, 30, 30)
        self.set_y(MARGIN_TOP)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-34)
        self.set_font("Body", "", 8.5)
        self.set_text_color(120, 110, 100)
        self.cell(0, 10, str(self.page_no()), align="C")
        self.set_text_color(30, 30, 30)


def build_story_pdf(title: str, author: str, stories: list[Story]) -> tuple[bytes, list[int]]:
    """The PDF, and the page each story starts on (1-based, in `stories` order)."""
    font_dir = _font_dir()
    regular = font_dir / DEFAULT_FONTS[""]
    supported = set(TTFont(str(regular)).getBestCmap())
    pdf = _Book(title, supported)
    for style, name in DEFAULT_FONTS.items():
        pdf.add_font("Body", style, str(font_dir / name))
    pdf.set_margins(MARGIN_X, MARGIN_TOP, MARGIN_X)
    pdf.set_auto_page_break(True, margin=MARGIN_BOTTOM)
    pdf.set_title(title)
    pdf.set_author(author)
    pdf.set_creator("BookWise")
    pdf.set_subject("Public-domain text")

    # Title page.
    pdf.add_page()
    pdf.set_y(190)
    pdf.set_font("Body", "B", 22)
    pdf.multi_cell(0, 28, pdf.safe(title), align="C")
    pdf.ln(10)
    pdf.set_font("Body", "", 12)
    pdf.multi_cell(0, 16, pdf.safe(author), align="C")
    pdf.ln(60)
    pdf.set_font("Body", "I", 9)
    pdf.multi_cell(0, 13, "Public-domain text\nA BookWise reading edition", align="C")

    starts: list[int] = []
    for story in stories:
        pdf.add_page()
        starts.append(pdf.page_no())
        pdf.start_section(pdf.safe(story.title))
        pdf.ln(36)
        pdf.set_font("Body", "B", 16)
        pdf.multi_cell(0, 21, pdf.safe(story.title), align="C")
        pdf.ln(22)
        for block in story.blocks:
            kind, text = block["type"], pdf.safe(block["text"])
            if kind == "p":
                pdf.set_font("Body", "", BODY_SIZE)
                pdf.multi_cell(0, LINE_HEIGHT, text, align="J")
                pdf.ln(5)
            elif kind == "h":
                pdf.ln(6)
                pdf.set_font("Body", "B", 11)
                pdf.multi_cell(0, LINE_HEIGHT, text, align="C")
                pdf.ln(6)
            elif kind == "verse":
                pdf.set_font("Body", "I", BODY_SIZE)
                pdf.set_x(MARGIN_X + 22)
                pdf.multi_cell(PAGE_SIZE[0] - 2 * MARGIN_X - 22, LINE_HEIGHT, text, align="L")
                pdf.ln(6)
            elif kind == "break":
                pdf.ln(4)
                pdf.set_font("Body", "", BODY_SIZE)
                pdf.cell(0, LINE_HEIGHT, "*     *     *", align="C", new_x="LMARGIN", new_y="NEXT")
                pdf.ln(8)
    return bytes(pdf.output()), starts
