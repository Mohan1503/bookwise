"""The Stories collection: splitting Gutenberg texts and the stories API."""
import pytest

from app.models.book import Book
from app.models.category import Category
from app.models.story_section import StorySection
from app.stories.text import StoryEntry, blocks_from, smart_quotes, split_stories, title_case
from tests.conftest import API

GUTENBERG_TEXT = """The Project Gutenberg eBook of Tiny Tales

*** START OF THE PROJECT GUTENBERG EBOOK TINY TALES ***

CONTENTS

    I THE MONKEY AND THE CROCODILE     3
   II THE SANDY ROAD                  10


PUBLISHER'S NOTE

Some words.



THE MONKEY AND THE CROCODILE

PART I

ONCE upon a time a Monkey lived in a tree by a river.
He was "very" clever.[1]

[Illustration: The Monkey]

   Up in the tree
   Sat the monkey free

III

Then the Crocodile came.



THE SANDY ROAD

A merchant crossed the desert--it was hot.

NOTES

[1] A note.

*** END OF THE PROJECT GUTENBERG EBOOK TINY TALES ***
"""


def test_split_stories_by_title():
    entries = [StoryEntry("The Monkey and the Crocodile"), StoryEntry("The Sandy Road")]
    stories = split_stories(GUTENBERG_TEXT, entries, start=r"^PUBLISHER'S NOTE", end=r"^NOTES$")

    assert [story.title for story in stories] == ["The Monkey and the Crocodile", "The Sandy Road"]
    monkey, road = stories
    assert [block["type"] for block in monkey.blocks] == ["h", "p", "verse", "break", "p"]
    assert monkey.blocks[0]["text"] == "Part I"
    # Drop cap undone, line breaks joined, curly quotes, footnote mark and illustration gone.
    assert monkey.blocks[1]["text"] == "Once upon a time a Monkey lived in a tree by a river. He was “very” clever."
    assert monkey.blocks[2]["text"] == "Up in the tree\nSat the monkey free"
    # The notes after the last story are not part of it.
    assert road.blocks == [{"type": "p", "text": "A merchant crossed the desert—it was hot."}]
    assert road.word_count == 7


def test_missing_heading_is_reported():
    with pytest.raises(ValueError, match="The Lost Story"):
        split_stories(GUTENBERG_TEXT, [StoryEntry("The Lost Story")])


def test_text_helpers():
    assert title_case("THE OX WHO WON THE FORFEIT") == "The Ox Who Won the Forfeit"
    assert title_case("MR. WON'T-GIVE") == "Mr. Won't-Give"
    assert smart_quotes("'Yes,' he said, \"it's mine.\"") == "‘Yes,’ he said, “it’s mine.”"
    centred_prose = ["        and so he was", "      led away, and", "        never seen again."]
    assert blocks_from(centred_prose)[0]["type"] == "p"


@pytest.fixture
def stories(api_client):
    client, test_session = api_client
    with test_session() as db:
        shelf = Category(name="Children's", slug="childrens")
        book = Book(title="Tiny Tales", slug="tiny-tales", status="PUBLISHED", visibility="PUBLIC", categories=[shelf])
        hidden = Book(title="Draft Tales", slug="draft-tales", status="DRAFT", visibility="PRIVATE")
        db.add_all([book, hidden])
        db.flush()
        for position, title in enumerate(["One", "Two", "Three"], start=1):
            db.add(StorySection(book_id=book.id, position=position, title=title, word_count=400, excerpt=f"{title}…",
                                pdf_page=position * 3, blocks=[{"type": "p", "text": f"Story {title}."}]))
        db.add(StorySection(book_id=hidden.id, position=1, title="Secret", word_count=400, excerpt="",
                            blocks=[{"type": "p", "text": "Hidden."}]))
        db.commit()
        ids = str(book.id), str(hidden.id)
    payload = {"full_name": "Reader", "email": "reader@example.com", "password": "reader-pass-123"}
    client.post(f"{API}/auth/register", json=payload)
    token = client.post(f"{API}/auth/login", json={"email": payload["email"], "password": payload["password"]}).json()["access_token"]
    return client, {"Authorization": f"Bearer {token}"}, *ids


def test_stories_home_lists_public_collections(stories):
    client, _headers, book_id, _hidden = stories
    body = client.get(f"{API}/stories").json()

    assert [item["book"]["id"] for item in body["collections"]] == [book_id]
    collection = body["collections"][0]
    assert collection["shelf"] == "childrens"
    assert collection["story_count"] == 3
    assert collection["reading_minutes"] == 6
    assert collection["first_stories"] == ["One", "Two", "Three"]
    assert body["story_of_the_day"]["book_id"] == book_id
    assert "childrens" in body["shelves"]


def test_collection_contents_are_public(stories):
    client, _headers, book_id, hidden_id = stories
    body = client.get(f"{API}/stories/{book_id}").json()
    assert [story["title"] for story in body["stories"]] == ["One", "Two", "Three"]
    assert body["stories"][1] == {"position": 2, "title": "Two", "reading_minutes": 2, "excerpt": "Two…", "pdf_page": 6}
    assert client.get(f"{API}/stories/{hidden_id}").status_code == 403


def test_reading_a_story_needs_sign_in(stories):
    client, headers, book_id, hidden_id = stories
    assert client.get(f"{API}/stories/{book_id}/2").status_code == 401

    story = client.get(f"{API}/stories/{book_id}/2", headers=headers).json()
    assert story["title"] == "Two"
    assert story["blocks"] == [{"type": "p", "text": "Story Two."}]
    assert story["previous"] == {"position": 1, "title": "One"}
    assert story["next"] == {"position": 3, "title": "Three"}
    assert story["story_count"] == 3

    last = client.get(f"{API}/stories/{book_id}/3", headers=headers).json()
    assert last["next"] is None
    assert client.get(f"{API}/stories/{book_id}/9", headers=headers).status_code == 404
    assert client.get(f"{API}/stories/{hidden_id}/1", headers=headers).status_code == 403
