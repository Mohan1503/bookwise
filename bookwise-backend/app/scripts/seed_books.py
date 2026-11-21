"""Seed the catalogue with a starter set of books.

Run from the backend directory (uses DATABASE_URL from .env):

    python -m app.scripts.seed_books

Safe to run more than once: publishers, categories and authors are matched by
slug and reused, and a book whose slug already exists is skipped, so nothing
is duplicated or overwritten.

Every ISBN was checked against Open Library, which the store uses for covers
when no cover has been uploaded. Publication dates are the first-publication
year unless the exact day is known. Prices are in Indian rupees (converted
from US prices at ₹94 per $1, rounded to end in 9); prices and ratings are
starting values to edit in the admin portal. Only the "Public domain" titles may have their full
text uploaded without a licence; the rest are catalogue entries only.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models.author import Author
from app.models.book import Book
from app.models.category import Category
from app.models.publisher import Publisher
from app.models.role import Role, UserRole
from app.models.user import User

PUBLISHERS = {
    "penguin-classics": ("Penguin Classics", "Long-running imprint of classic literature from around the world."),
    "penguin-books": ("Penguin Books", None),
    "avery": ("Avery", None),
    "plata-publishing": ("Plata Publishing", None),
    "free-press": ("Free Press", None),
    "tarcher-penguin": ("Tarcher/Penguin", None),
    "harpercollins": ("HarperCollins", None),
    "harper": ("Harper", None),
    "harper-perennial-modern-classics": ("Harper Perennial Modern Classics", None),
    "harpertrophy": ("HarperTrophy", None),
    "scribner": ("Scribner", None),
    "dutton-books": ("Dutton Books", None),
    "riverhead-books": ("Riverhead Books", None),
    "bloomsbury": ("Bloomsbury", None),
    "mariner-books": ("Mariner Books", None),
    "scholastic-press": ("Scholastic Press", None),
    "ace-books": ("Ace Books", None),
    "celadon-books": ("Celadon Books", None),
    "anchor-books": ("Anchor Books", None),
    "broadway-books": ("Broadway Books", None),
    "bantam-books": ("Bantam Books", None),
    "doubleday": ("Doubleday", None),
    "universities-press": ("Universities Press", None),
    "rupa-publications": ("Rupa Publications", None),
    "westland": ("Westland", None),
    "puffin-classics": ("Puffin Classics", None),
    "dover-publications": ("Dover Publications", None),
    "signet-classics": ("Signet Classics", None),
    "longmeadow-press": ("Longmeadow Press", None),
    "floating-world-editions": ("Floating World Editions", None),
}

CATEGORIES = {
    "classics": ("Classics", "Enduring books that have shaped literature."),
    "fiction": ("Fiction", "Stories, novels and imagined worlds to disappear into."),
    "romance": ("Romance", "Courtship, love and the obstacles in its way."),
    "science-fiction": ("Science Fiction", "Science, invention and what it could mean for us."),
    "mystery": ("Mystery", "Puzzles, detectives and crimes waiting to be solved."),
    "thriller": ("Thriller", "Suspense, twists and stories you can't put down."),
    "adventure": ("Adventure", "Voyages, quests and danger on the horizon."),
    "fantasy": ("Fantasy", "Impossible worlds with their own rules."),
    "childrens": ("Children's", "Stories written for young readers, loved at any age."),
    "personal-development": ("Personal Development", "Practical habits and frameworks for becoming your best self."),
    "psychology": ("Psychology", "How the mind works, from behaviour to decision making."),
    "finance": ("Finance", "Money, markets and the psychology of building wealth."),
    "biography": ("Biography", "True stories of lives that changed the way we see the world."),
    "indian-literature": ("Indian Literature", "Novels, stories and memoirs by Indian writers."),
    "philosophy": ("Philosophy", "Ideas about how to live, think and lead."),
}

AUTHORS = {
    # Classics
    "jane-austen": ("Jane Austen", "English novelist (1775–1817) known for sharp social comedy."),
    "louisa-may-alcott": ("Louisa May Alcott", "American novelist (1832–1888) best known for Little Women."),
    # Motivational & self-development
    "james-clear": ("James Clear", "American writer on habits, decision making and continuous improvement."),
    "joseph-murphy": ("Joseph Murphy", "Irish-born American author and New Thought minister (1898–1981)."),
    "robert-kiyosaki": ("Robert Kiyosaki", "American businessman and author on personal finance (born 1947)."),
    "stephen-r-covey": ("Stephen R. Covey", "American educator and author on leadership (1932–2012)."),
    "napoleon-hill": ("Napoleon Hill", "American author of early self-help writing on success (1883–1970)."),
    "paulo-coelho": ("Paulo Coelho", "Brazilian novelist and lyricist (born 1947)."),
    # Novels
    "f-scott-fitzgerald": ("F. Scott Fitzgerald", "American novelist of the Jazz Age (1896–1940)."),
    "harper-lee": ("Harper Lee", "American novelist from Alabama (1926–2016)."),
    "john-green": ("John Green", "American author of young-adult fiction (born 1977)."),
    "khaled-hosseini": ("Khaled Hosseini", "Afghan-American novelist and physician (born 1965)."),
    # Fiction & fantasy
    "j-k-rowling": ("J.K. Rowling", "British author of the Harry Potter series (born 1965)."),
    "j-r-r-tolkien": ("J.R.R. Tolkien", "English writer and philologist (1892–1973), author of The Lord of the Rings."),
    "suzanne-collins": ("Suzanne Collins", "American author and television writer (born 1962)."),
    "frank-herbert": ("Frank Herbert", "American science-fiction writer (1920–1986)."),
    "c-s-lewis": ("C.S. Lewis", "British writer and scholar (1898–1963), author of The Chronicles of Narnia."),
    # Mystery & thriller
    "alex-michaelides": ("Alex Michaelides", "British-Cypriot author and screenwriter (born 1977)."),
    "agatha-christie": ("Agatha Christie", "English crime novelist (1890–1976), creator of Poirot and Miss Marple."),
    "dan-brown": ("Dan Brown", "American author of thrillers (born 1964)."),
    "gillian-flynn": ("Gillian Flynn", "American novelist and screenwriter (born 1971)."),
    # Indian writers
    "a-p-j-abdul-kalam": ("A.P.J. Abdul Kalam", "Indian aerospace scientist and 11th President of India (1931–2015)."),
    "aravind-adiga": ("Aravind Adiga", "Indian-Australian writer and journalist (born 1974)."),
    "r-k-narayan": ("R.K. Narayan", "Indian novelist (1906–2001) of the fictional town of Malgudi."),
    "chitra-banerjee-divakaruni": ("Chitra Banerjee Divakaruni", "Indian-American author and poet (born 1956)."),
    "chetan-bhagat": ("Chetan Bhagat", "Indian novelist and columnist (born 1974)."),
    "amish-tripathi": ("Amish Tripathi", "Indian author of mythological fiction (born 1974)."),
    "ruskin-bond": ("Ruskin Bond", "Indian author of short stories and children's books (born 1934)."),
    # Public-domain library (readable online)
    "rabindranath-tagore": ("Rabindranath Tagore", "Bengali poet, writer and composer (1861–1941); Nobel Prize in Literature, 1913."),
    "rudyard-kipling": ("Rudyard Kipling", "English writer born in Bombay (1865–1936); Nobel Prize in Literature, 1907."),
    "james-allen": ("James Allen", "British philosophical writer (1864–1912), an early voice of the self-help movement."),
    "marcus-aurelius": ("Marcus Aurelius", "Roman emperor (121–180) and Stoic philosopher."),
    "sun-tzu": ("Sun Tzu", "Chinese general and strategist traditionally credited with The Art of War."),
    "h-g-wells": ("H. G. Wells", "English writer (1866–1946), a founding figure of science fiction."),
    "robert-louis-stevenson": ("Robert Louis Stevenson", "Scottish novelist, poet and travel writer (1850–1894)."),
    "l-frank-baum": ("L. Frank Baum", "American author (1856–1919), creator of the Land of Oz."),
}


def book(slug, title, author, isbn, published, categories, price, rating, description, *,
         publisher, featured=False, public_domain=False):
    """`published` is (year, month, day), (year,) when only the year is known, or None."""
    return {
        "slug": slug,
        "title": title,
        "author": author,
        "isbn": isbn,
        "published": published,
        "categories": categories,
        "price": price,
        "rating": rating,
        "description": description,
        "publisher": publisher,
        "featured": featured,
        "rights_status": "Public domain" if public_domain else None,
    }


CLASSICS = [
    book("pride-and-prejudice", "Pride and Prejudice", "jane-austen", "9780141439518", (1813, 1, 28),
         ["romance", "classics"], "659", 4.7,
         "Elizabeth Bennet and the proud Mr Darcy misjudge each other at every turn in Austen's witty comedy of "
         "manners, marriage and first impressions.",
         publisher="penguin-classics", featured=True, public_domain=True),
    book("little-women", "Little Women", "louisa-may-alcott", "9780140390698", (1868, 9, 30),
         ["fiction", "classics"], "659", 4.3,
         "The four March sisters grow up in New England during the Civil War, each chasing her own idea of a "
         "good life.",
         publisher="penguin-classics", public_domain=True),
]

SELF_DEVELOPMENT = [
    book("atomic-habits", "Atomic Habits", "james-clear", "9780735211292", (2018,),
         ["personal-development", "psychology"], "1599", 4.6,
         "Small habits, big changes. Clear shows how tiny, consistent improvements compound over time, with "
         "practical ways to build good habits and break bad ones.",
         publisher="avery", featured=True),
    book("the-power-of-your-subconscious-mind", "The Power of Your Subconscious Mind", "joseph-murphy",
         "0553583182", (1963,), ["personal-development", "psychology"], "939", 4.2,
         "Understanding the power of your mind. Murphy argues that the beliefs held in the subconscious shape "
         "health, relationships and success, and offers affirmation techniques to change them.",
         publisher="bantam-books"),
    book("rich-dad-poor-dad", "Rich Dad Poor Dad", "robert-kiyosaki", "9781612680194", (1997,),
         ["finance", "personal-development"], "1219", 4.3,
         "Financial education and mindset. Kiyosaki contrasts the money lessons of two father figures to make "
         "the case for financial literacy, owning assets and investing.",
         publisher="plata-publishing"),
    book("the-7-habits-of-highly-effective-people", "The 7 Habits of Highly Effective People", "stephen-r-covey",
         "9780743269513", (1989,), ["personal-development"], "1409", 4.4,
         "Personal growth and productivity. Covey sets out seven principles for effectiveness, moving from "
         "personal independence to working well with others.",
         publisher="free-press"),
    book("think-and-grow-rich", "Think and Grow Rich", "napoleon-hill", "9781585424337", (1937,),
         ["personal-development", "finance"], "1029", 4.2,
         "Success, ambition and determination. Drawing on interviews with successful people of his era, Hill "
         "sets out principles for turning a burning desire into achievement.",
         publisher="tarcher-penguin"),
    book("the-alchemist", "The Alchemist", "paulo-coelho", "9780062315007", (1988,),
         ["fiction", "personal-development"], "1129", 4.3,
         "Dreams, destiny and following your passion. A young Andalusian shepherd travels to the Egyptian "
         "desert in search of treasure and learns to listen to his heart.",
         publisher="harpercollins", featured=True),
]

NOVELS = [
    book("the-great-gatsby", "The Great Gatsby", "f-scott-fitzgerald", "9780743273565", (1925,),
         ["fiction", "classics"], "1029", 4.2,
         "Nick Carraway is drawn into the world of his wealthy, mysterious neighbour Jay Gatsby and his "
         "longing for Daisy Buchanan on Jazz Age Long Island.",
         publisher="scribner", public_domain=True),  # Fitzgerald died 1940: public domain in India and the US
    book("to-kill-a-mockingbird", "To Kill a Mockingbird", "harper-lee", "9780061120084", (1960,),
         ["fiction", "classics"], "1129", 4.6,
         "In a small Alabama town, Scout Finch watches her father, the lawyer Atticus Finch, defend a Black man "
         "falsely accused of a crime.",
         publisher="harper-perennial-modern-classics"),
    book("the-fault-in-our-stars", "The Fault in Our Stars", "john-green", "9780525478812", (2012,),
         ["fiction", "romance"], "1029", 4.3,
         "Two teenagers who meet at a cancer support group fall in love and set out to meet the author of "
         "their favourite novel.",
         publisher="dutton-books"),
    book("the-kite-runner", "The Kite Runner", "khaled-hosseini", "9781594631931", (2003,),
         ["fiction"], "1219", 4.5,
         "Amir returns to a changed Afghanistan to make amends for betraying Hassan, his closest friend from "
         "a Kabul childhood.",
         publisher="riverhead-books"),
]

FICTION_FANTASY = [
    book("harry-potter-and-the-philosophers-stone", "Harry Potter and the Philosopher's Stone", "j-k-rowling",
         "9780747532699", (1997,), ["fantasy", "childrens"], "939", 4.7,
         "On his eleventh birthday, orphan Harry Potter learns that he is a wizard and begins his first year at "
         "Hogwarts School of Witchcraft and Wizardry.",
         publisher="bloomsbury", featured=True),
    book("the-fellowship-of-the-ring", "The Fellowship of the Ring", "j-r-r-tolkien", "9780547928210", (1954,),
         ["fantasy", "adventure", "classics"], "1219", 4.6,
         "Frodo Baggins inherits a dangerous ring and leaves the Shire with a fellowship sworn to destroy it, "
         "in the first part of The Lord of the Rings.",
         publisher="mariner-books"),
    book("the-hunger-games", "The Hunger Games", "suzanne-collins", "9780439023481", (2008,),
         ["science-fiction", "adventure"], "1029", 4.4,
         "In the nation of Panem, Katniss Everdeen volunteers in her sister's place for a televised fight to "
         "the death.",
         publisher="scholastic-press"),
    book("dune", "Dune", "frank-herbert", "9780441172719", (1965,),
         ["science-fiction", "classics"], "1129", 4.5,
         "Paul Atreides' family takes charge of the desert planet Arrakis, the only source of the most valuable "
         "substance in the universe.",
         publisher="ace-books"),
    book("the-lion-the-witch-and-the-wardrobe", "The Lion, the Witch and the Wardrobe", "c-s-lewis",
         "9780064404990", (1950,), ["fantasy", "childrens", "classics"], "849", 4.4,
         "Four children step through a wardrobe into Narnia, a land held in endless winter by the White Witch.",
         publisher="harpertrophy"),
]

MYSTERY_THRILLER = [
    book("the-silent-patient", "The Silent Patient", "alex-michaelides", "9781250301697", (2019,),
         ["thriller", "mystery"], "1319", 4.2,
         "A celebrated painter shoots her husband and never speaks again; a psychotherapist becomes obsessed "
         "with finding out why.",
         publisher="celadon-books"),
    book("and-then-there-were-none", "And Then There Were None", "agatha-christie", "9780062073488", (1939,),
         ["mystery", "classics"], "939", 4.5,
         "Ten strangers are lured to an island off the Devon coast, where they begin to die one by one.",
         publisher="harper"),
    book("the-da-vinci-code", "The Da Vinci Code", "dan-brown", "9780307474278", (2003,),
         ["thriller", "mystery"], "1029", 4.0,
         "After a murder in the Louvre, symbologist Robert Langdon and cryptologist Sophie Neveu follow clues "
         "hidden in famous works of art.",
         publisher="anchor-books"),
    book("gone-girl", "Gone Girl", "gillian-flynn", "9780307588371", (2012,),
         ["thriller", "mystery"], "1129", 4.1,
         "When Amy Dunne disappears on her fifth wedding anniversary, suspicion falls on her husband Nick as "
         "their marriage is laid bare.",
         publisher="broadway-books"),
]

INDIAN = [
    book("wings-of-fire", "Wings of Fire", "a-p-j-abdul-kalam", "9788173711466", (1999,),
         ["biography", "indian-literature"], "749", 4.6,
         "Written with Arun Tiwari, Kalam's autobiography follows him from a childhood in Rameswaram to leading "
         "India's space and missile programmes.",
         publisher="universities-press", featured=True),
    book("the-white-tiger", "The White Tiger", "aravind-adiga", "9781416562603", (2008,),
         ["fiction", "indian-literature"], "1029", 4.0,
         "Balram Halwai, a driver from a poor village, tells the darkly comic story of how he broke free of "
         "servitude in modern India.",
         publisher="free-press"),
    book("the-guide", "The Guide", "r-k-narayan", "9780143039648", (1958,),
         ["fiction", "indian-literature", "classics"], "849", 4.3,
         "Raju, a tour guide just released from prison, is mistaken for a holy man by the villagers near "
         "Malgudi.",
         publisher="penguin-books"),
    book("malgudi-days", "Malgudi Days", "r-k-narayan", "9780143039655", (1943,),
         ["fiction", "indian-literature", "classics"], "849", 4.4,
         "Short stories of everyday lives in Malgudi, R.K. Narayan's fictional South Indian town.",
         publisher="penguin-books"),
    book("the-palace-of-illusions", "The Palace of Illusions", "chitra-banerjee-divakaruni", "9780385515993",
         (2008,), ["fiction", "indian-literature"], "1129", 4.3,
         "The Mahabharata retold by Panchaali (Draupadi), from her birth in fire to the war at Kurukshetra.",
         publisher="doubleday"),
    book("five-point-someone", "Five Point Someone", "chetan-bhagat", "9788129104595", (2004,),
         ["fiction", "indian-literature"], "559", 3.9,
         "Three friends struggle with their grades at IIT Delhi in a comic look at college life and pressure "
         "to succeed.",
         publisher="rupa-publications"),
    book("the-immortals-of-meluha", "The Immortals of Meluha", "amish-tripathi", "9789380658742", (2010,),
         ["fantasy", "indian-literature"], "749", 4.2,
         "Shiva, a Tibetan tribal chief, is hailed in the land of Meluha as its prophesied saviour, in the "
         "first book of the Shiva Trilogy.",
         publisher="westland"),
    book("the-blue-umbrella", "The Blue Umbrella", "ruskin-bond", "9788171673407", None,
         ["childrens", "indian-literature"], "379", 4.4,
         "In a Himalayan village, young Binya trades her lucky leopard-claw pendant for a beautiful blue "
         "umbrella that everyone around her covets.",
         publisher="rupa-publications"),
]

# Public domain in India (author died before 1966) and the US; reading copies can be attached.
PUBLIC_DOMAIN_LIBRARY = [
    book("gitanjali", "Gitanjali", "rabindranath-tagore", "9781891640285", (1912,),
         ["indian-literature", "classics"], "249", 4.6,
         "Song Offerings: 103 prose poems of devotion and wonder, translated by Tagore from his own Bengali "
         "verse, with W. B. Yeats's introduction to the first English edition.",
         publisher="floating-world-editions", featured=True, public_domain=True),
    book("the-home-and-the-world", "The Home and the World", "rabindranath-tagore", "9780140449860", (1916,),
         ["fiction", "indian-literature", "classics"], "449", 4.1,
         "In Bengal during the Swadeshi movement, Bimala is torn between her gentle husband Nikhil and the "
         "fiery nationalist Sandip, and each of the three tells the story in turn.",
         publisher="penguin-books", public_domain=True),
    book("kim", "Kim", "rudyard-kipling", "9780141442372", (1901,),
         ["adventure", "classics"], "499", 4.0,
         "An orphaned boy growing up on the streets of Lahore becomes the disciple of a Tibetan lama while "
         "being drawn into the Great Game of espionage across India.",
         publisher="penguin-classics", public_domain=True),
    book("the-jungle-book", "The Jungle Book", "rudyard-kipling", "9780141325293", (1894,),
         ["childrens", "adventure", "classics"], "349", 4.2,
         "Mowgli, raised by wolves in the Indian jungle, learns its law from Baloo and Bagheera, alongside "
         "the tales of Rikki-Tikki-Tavi, the White Seal and the songs that go with them.",
         publisher="puffin-classics", public_domain=True),
    book("as-a-man-thinketh", "As a Man Thinketh", "james-allen", "9780681418653", (1903,),
         ["personal-development", "psychology"], "199", 4.4,
         "A short classic of the self-help movement arguing that our thoughts shape our character, our "
         "circumstances and even our health.",
         publisher="longmeadow-press", public_domain=True),
    book("meditations", "Meditations", "marcus-aurelius", "9780486298238", None,
         ["philosophy", "personal-development", "classics"], "299", 4.5,
         "The private notes of a Roman emperor on duty, self-discipline and keeping calm in a troubled world, "
         "in George Long's translation.",
         publisher="dover-publications", public_domain=True),
    book("the-art-of-war", "The Art of War", "sun-tzu", "9780486425573", None,
         ["philosophy", "classics"], "199", 4.3,
         "Thirteen short chapters on strategy, preparation and knowing both yourself and your opponent, in "
         "Lionel Giles's 1910 translation.",
         publisher="dover-publications", public_domain=True),
    book("the-time-machine", "The Time Machine", "h-g-wells", "9780141439976", (1895,),
         ["science-fiction", "classics"], "299", 4.1,
         "A Victorian inventor travels to the year 802,701 and finds humanity split into the gentle Eloi and "
         "the Morlocks who live underground.",
         publisher="penguin-classics", public_domain=True),
    book("treasure-island", "Treasure Island", "robert-louis-stevenson", "9780141192451", (1883,),
         ["adventure", "childrens", "classics"], "349", 4.2,
         "Young Jim Hawkins finds a treasure map and sets sail with the charming, dangerous Long John Silver.",
         publisher="penguin-classics", public_domain=True),
    book("the-wonderful-wizard-of-oz", "The Wonderful Wizard of Oz", "l-frank-baum", "9780451530295", (1900,),
         ["fantasy", "childrens", "classics"], "349", 4.3,
         "A cyclone carries Dorothy from Kansas to Oz, where she follows the yellow brick road with the "
         "Scarecrow, the Tin Woodman and the Cowardly Lion.",
         publisher="signet-classics", public_domain=True),
]

BOOKS = CLASSICS + SELF_DEVELOPMENT + NOVELS + FICTION_FANTASY + MYSTERY_THRILLER + INDIAN + PUBLIC_DOMAIN_LIBRARY


def _get_or_create(db, model, slug: str, **fields):
    existing = db.execute(select(model).where(model.slug == slug)).scalar_one_or_none()
    if existing is not None:
        return existing
    item = model(slug=slug, **fields)
    db.add(item)
    db.flush()
    return item


def _publication_date(published):
    if not published:
        return None
    year, month, day = (*published, 1, 1)[:3]
    return datetime(year, month, day, tzinfo=timezone.utc)


def main() -> int:
    created: list[str] = []
    skipped: list[str] = []
    with SessionLocal() as db:
        publishers = {
            slug: _get_or_create(db, Publisher, slug, name=name, description=description)
            for slug, (name, description) in PUBLISHERS.items()
        }
        categories = {
            slug: _get_or_create(db, Category, slug, name=name, description=description)
            for slug, (name, description) in CATEGORIES.items()
        }
        authors = {
            slug: _get_or_create(db, Author, slug, name=name, bio=bio)
            for slug, (name, bio) in AUTHORS.items()
        }
        superadmin_id = db.execute(
            select(User.id)
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == "superadmin")
            .limit(1)
        ).scalar_one_or_none()

        for entry in BOOKS:
            if db.execute(select(Book.id).where(Book.slug == entry["slug"])).scalar_one_or_none() is not None:
                skipped.append(entry["title"])
                continue
            db.add(Book(
                title=entry["title"],
                slug=entry["slug"],
                description=entry["description"],
                isbn=entry["isbn"],
                language="en",
                publication_date=_publication_date(entry["published"]),
                publisher_id=publishers[entry["publisher"]].id,
                price=Decimal(entry["price"]),
                rating=entry["rating"],
                featured=entry["featured"],
                status="PUBLISHED",
                visibility="PUBLIC",
                rights_status=entry["rights_status"],
                uploaded_by=superadmin_id,
                authors=[authors[entry["author"]]],
                categories=[categories[slug] for slug in entry["categories"]],
            ))
            created.append(entry["title"])
        db.commit()

    print(f"Added {len(created)} book(s).")
    for title in created:
        print(f"  + {title}")
    if skipped:
        print(f"Skipped {len(skipped)} already in the catalogue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
