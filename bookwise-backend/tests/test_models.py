from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.models.author import Author
from app.models.book import Book, BookAuthor, BookCategory
from app.models.category import Category
from app.models.publisher import Publisher


def test_multiple_authors_and_categories():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    publisher = Publisher(name="Example Press", slug="example-press")
    author_one = Author(name="Author One", slug="author-one")
    author_two = Author(name="Author Two", slug="author-two")
    category_one = Category(name="Fiction", slug="fiction")
    category_two = Category(name="Fantasy", slug="fantasy")
    session.add_all([publisher, author_one, author_two, category_one, category_two])
    session.commit()

    book = Book(
        title="The Book",
        slug="the-book",
        description="A sample book",
        language="en",
        publication_date=datetime.now(timezone.utc),
        publisher_id=publisher.id,
        status="PUBLISHED",
        visibility="PUBLIC",
    )
    session.add(book)
    session.commit()

    session.add_all([
        BookAuthor(book_id=book.id, author_id=author_one.id),
        BookAuthor(book_id=book.id, author_id=author_two.id),
        BookCategory(book_id=book.id, category_id=category_one.id),
        BookCategory(book_id=book.id, category_id=category_two.id),
    ])
    session.commit()

    assert book.title == "The Book"
    assert len(session.query(BookAuthor).filter_by(book_id=book.id).all()) == 2
    assert len(session.query(BookCategory).filter_by(book_id=book.id).all()) == 2
    session.close()
