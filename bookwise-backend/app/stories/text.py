"""Split a Project Gutenberg plain-text book into its separate stories.

Pure functions, no I/O. A book's stories are found by their titles (taken from the
book's contents page), so each collection's own heading style does not matter.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

_GUTENBERG_START = re.compile(r"\*\*\* ?START OF.*?\*\*\*", re.IGNORECASE)
_GUTENBERG_END = re.compile(r"\*\*\* ?END OF|^End of (?:the |this )?Project Gutenberg", re.IGNORECASE | re.MULTILINE)
_ROMAN = r"[IVXLC]+"
_BREAK = re.compile(rf"^(?:{_ROMAN}|\d+|[*\s.]+|_?{_ROMAN}\._?)\.?$")
_PART = re.compile(rf"^(?:PART|BOOK|CHAPTER)\s+(?:{_ROMAN}|\d+|[A-Z]+)\.?$|^(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|LAST) PART\.?$", re.IGNORECASE)
_ILLUSTRATION = re.compile(r"\[(?:Illustration|Footnote|Sidenote|Decoration|Headpiece|Tailpiece)[^\]]*\]", re.IGNORECASE | re.DOTALL)
_FOOTNOTE_MARK = re.compile(r"\[\d+\]|\[[A-Z]\]")
_SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on",
                "or", "the", "to", "with"}


@dataclass(frozen=True)
class StoryEntry:
    """One story in a book's contents: the heading to look for and the title to show."""
    match: str
    title: str | None = None
    absorb_subtitle: bool = False  # the line after the heading is a subtitle, e.g. "IN WHICH ..."


@dataclass
class Story:
    title: str
    blocks: list[dict] = field(default_factory=list)  # {"type": "p"|"h"|"verse"|"break", "text": str}

    @property
    def word_count(self) -> int:
        return sum(len(block["text"].split()) for block in self.blocks)


def decode(raw: bytes) -> str:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")


def gutenberg_body(text: str) -> str:
    """The book itself, without Project Gutenberg's header and licence."""
    start = _GUTENBERG_START.search(text)
    end = _GUTENBERG_END.search(text, start.end() if start else 0)
    return text[start.end() if start else 0: end.start() if end else len(text)]


def normalize(value: str) -> str:
    """Heading text reduced to bare letters and digits, for matching."""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = _FOOTNOTE_MARK.sub("", value).upper()
    value = re.sub(rf"^\s*(?:{_ROMAN}|\d+)\.\s+", "", value)
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return value.strip()


def title_case(value: str) -> str:
    """"THE OX WHO WON THE FORFEIT" -> "The Ox Who Won the Forfeit"."""
    words = value.lower().split()
    result = []
    for index, word in enumerate(words):
        if index and word.strip(",;") in _SMALL_WORDS and not result[-1].endswith(":"):
            result.append(word)
        else:
            result.append(re.sub(r"(^|-)([^a-zà-ÿ]*)([a-zà-ÿ])", lambda m: m.group(1) + m.group(2) + m.group(3).upper(), word))
    return " ".join(result)


def smart_quotes(text: str) -> str:
    text = text.replace("--", "—")
    text = re.sub(r'(^|[\s(\[—])"', r"\1“", text)
    text = text.replace('"', "”")
    text = re.sub(r"(^|[\s(\[—“])'", r"\1‘", text)
    return text.replace("'", "’")


def _clean_inline(text: str) -> str:
    text = _FOOTNOTE_MARK.sub("", text)
    text = re.sub(r"(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])", r"\1", text)  # _italics_
    text = text.replace("_", "").replace("*", "")
    return smart_quotes(re.sub(r"[ \t]+", " ", text).strip())


def _undo_drop_cap(text: str) -> str:
    """Printed books set a story's first words in capitals: "ONCE upon" -> "Once upon"."""
    match = re.match(r"^([“‘]?)((?:[A-Z][A-Z’']+|A)(?: [A-Z][A-Z’']+)*)(?= [a-z])", text)
    if not match or match.group(2) in {"I", "A"}:
        return text
    words = match.group(2).split(" ")
    fixed = " ".join([words[0].capitalize()] + [word.lower() for word in words[1:]])
    return match.group(1) + fixed + text[match.end():]


def _is_caps_line(text: str) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    return bool(letters) and len(text) <= 70 and all(not ch.islower() for ch in letters)


def blocks_from(lines: list[str]) -> list[dict]:
    """Paragraphs, sub-headings, verse and scene breaks of one story."""
    text = _ILLUSTRATION.sub("", "\n".join(lines))
    blocks: list[dict] = []
    for para in re.split(r"\n\s*\n", text):
        raw_lines = [line.rstrip() for line in para.split("\n") if line.strip()]
        if not raw_lines:
            continue
        joined = " ".join(line.strip() for line in raw_lines)
        bare = joined.replace("_", "").strip()
        if _BREAK.match(bare):
            if blocks and blocks[-1]["type"] != "break":
                blocks.append({"type": "break", "text": ""})
            continue
        if len(raw_lines) == 1 and (_PART.match(bare) or _is_caps_line(bare)):
            blocks.append({"type": "h", "text": title_case(_clean_inline(bare).rstrip(".:"))})
            continue
        indents = [len(line) - len(line.lstrip()) for line in raw_lines]
        # Verse: indented short lines that each start with a capital (centred prose does not).
        capitalised = sum(1 for line in raw_lines if re.match(r"[\W_]*[A-Z]", line.strip()))
        if (len(raw_lines) >= 2 and min(indents) >= 2 and max(len(line.strip()) for line in raw_lines) <= 64
                and capitalised >= 0.6 * len(raw_lines)):
            blocks.append({"type": "verse", "text": "\n".join(_clean_inline(line) for line in raw_lines)})
            continue
        blocks.append({"type": "p", "text": _clean_inline(joined)})
    while blocks and blocks[0]["type"] == "break":
        blocks.pop(0)
    # Trailing scene breaks and sign-offs such as initials ("M. F") or the book's name.
    while blocks and (blocks[-1]["type"] == "break" or (
            blocks[-1]["type"] == "p" and len(blocks[-1]["text"].split()) <= 4
            and not re.search(r"[.!?”’]$", blocks[-1]["text"]))):
        blocks.pop()
    return blocks


def _find_heading(lines: list[str], target: str, start: int) -> tuple[int, int] | None:
    """(first line, line after the heading) of `target`, searching from `start`."""
    for index in range(start, len(lines)):
        line = lines[index].strip()
        if not line or len(line) > 120 or (index and lines[index - 1].strip()):
            continue
        if normalize(line) == target:
            return index, index + 1
        if index + 1 < len(lines) and lines[index + 1].strip() and normalize(f"{line} {lines[index + 1]}") == target:
            return index, index + 2
    return None


def split_stories(text: str, entries: list[StoryEntry], *, start: str | None = None, end: str | None = None) -> list[Story]:
    """Cut a book into the stories named in `entries`, in order.

    `start` (a regex) is a line the stories come after, to skip the contents page;
    `end` (a regex) is a line where the last story stops, such as the notes.
    Raises ValueError naming any story whose heading cannot be found.
    """
    lines = gutenberg_body(text).split("\n")
    cursor = 0
    if start:
        pattern = re.compile(start)
        cursor = next((i for i, line in enumerate(lines) if pattern.search(line.strip())), 0)

    found: list[tuple[StoryEntry, int, int]] = []
    for entry in entries:
        hit = _find_heading(lines, normalize(entry.match), cursor)
        if hit is None:
            raise ValueError(f"heading not found: {entry.match!r}")
        first, after = hit
        subtitle = None
        if entry.absorb_subtitle:
            while after < len(lines) and not lines[after].strip():
                after += 1
            subtitle = lines[after].strip()
            after += 1
        found.append((entry, first, after, subtitle))
        cursor = after

    stop = len(lines)
    if end:
        pattern = re.compile(end)
        stop = next((i for i in range(found[-1][2], len(lines)) if pattern.search(lines[i].strip())), stop)

    stories = []
    for position, (entry, first, after, subtitle) in enumerate(found):
        until = found[position + 1][1] if position + 1 < len(found) else stop
        heading = _clean_inline(entry.match).rstrip(".")
        title = entry.title or (title_case(heading) if _is_caps_line(heading) else heading)
        if subtitle and not entry.title:
            subtitle = _clean_inline(subtitle).rstrip(".")
            title = f"{title}: {title_case(subtitle) if _is_caps_line(subtitle) else subtitle}"
        blocks = blocks_from(lines[after:until])
        # Some books repeat the title as the first line of the story.
        if blocks and blocks[0]["type"] in {"h", "p"} and normalize(blocks[0]["text"]) == normalize(entry.match):
            blocks.pop(0)
        first_paragraph = next((block for block in blocks if block["type"] == "p"), None)
        if first_paragraph:
            first_paragraph["text"] = _undo_drop_cap(first_paragraph["text"])
        stories.append(Story(title=title, blocks=blocks))
    return stories
