"""The Stories collection: public-domain Indian story books from Project Gutenberg.

Each entry lists the book's stories by the headings used in the text, so the book can
be split into separate stories. All authors and translators died long enough ago for
these editions to be out of copyright in India and the United States.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.stories.text import StoryEntry as S

# Shelves on the Stories page. Every story book is in "stories" plus one of these.
SHELVES = {
    "childrens": "For children",
    "folk-tales": "Folk tales",
    "classics": "Classic stories",
}


@dataclass(frozen=True)
class StoryBook:
    gutenberg_id: int
    slug: str
    title: str
    authors: list[tuple[str, str]]  # (slug, name)
    year: int
    shelf: str
    description: str
    entries: list[S]
    rating: float = 4.4
    start: str | None = None
    end: str | None = None
    extra_categories: list[str] = field(default_factory=lambda: ["indian-literature"])


def _titles(*names: str | S) -> list[S]:
    return [name if isinstance(name, S) else S(name) for name in names]


STORY_BOOKS: list[StoryBook] = [
    StoryBook(
        62514, "jataka-tales", "Jataka Tales", [("ellen-c-babbitt", "Ellen C. Babbitt")], 1912, "childrens",
        "Eighteen short animal fables from the Jatakas, the ancient Buddhist birth stories, retold for children: "
        "the monkey who outwits a crocodile, the turtle who couldn't stop talking and more.",
        _titles(
            "The Monkey and the Crocodile", "How the Turtle Saved His Own Life", "The Merchant of Seri",
            "The Turtle Who Couldn't Stop Talking", "The Ox Who Won the Forfeit", "The Sandy Road",
            "The Quarrel of the Quails", "The Measure of Rice", "The Foolish, Timid Rabbit",
            "The Wise and the Foolish Merchant", "The Elephant Girly-Face", "The Banyan Deer",
            "The Princes and the Water-Sprite", "The King's White Elephant", "The Ox Who Envied the Pig",
            "Granny's Blackie", "The Crab and the Crane", "Why the Owl Is Not King of the Birds",
        ),
        rating=4.6, start=r"^PUBLISHER'S NOTE", end=r"^THE END$",
    ),
    StoryBook(
        7518, "more-jataka-tales", "More Jataka Tales", [("ellen-c-babbitt", "Ellen C. Babbitt")], 1922, "childrens",
        "Twenty-one more Jataka fables for young readers, with clever monkeys, cunning wolves, a golden goose "
        "and a brave little bowman.",
        _titles(
            "The Girl Monkey and the String of Pearls", "The Three Fishes", "The Tricky Wolf and the Rats",
            "The Woodpecker, Turtle, and Deer", "The Golden Goose", "The Stupid Monkeys", "The Cunning Wolf",
            "The Penny-Wise Monkey", "The Red-Bud Tree", "The Woodpecker and the Lion", "The Otters and the Wolf",
            "How the Monkey Saved His Troop", "The Hawks and Their Friends", "The Brave Little Bowman",
            "The Foolhardy Wolf", "The Stolen Plow", "The Lion in Bad Company", "The Wise Goat and the Wolf",
            "Prince Wicked and the Grateful Animals", "Beauty and Brownie", "The Elephant and the Dog",
        ),
        rating=4.5, start=r"^XXI THE ELEPHANT AND THE DOG",
    ),
    StoryBook(
        7128, "indian-fairy-tales", "Indian Fairy Tales", [("joseph-jacobs", "Joseph Jacobs")], 1892, "childrens",
        "Twenty-nine magical tales from across India gathered by Joseph Jacobs: talking animals, a magic fiddle, "
        "the demon Punchkin and the tiger, the Brahman and the jackal.",
        _titles(
            "The Lion and the Crane", "How the Raja's Son Won the Princess Labam", "The Lambikin", "Punchkin",
            "The Broken Pot", "The Magic Fiddle", "The Cruel Crane Outwitted", "Loving Laili",
            "The Tiger, the Brahman, and the Jackal", "The Soothsayer's Son", "Harisarman", "The Charmed Ring",
            "The Talkative Tortoise", S("A Lac of Rupees for a Bit of Advice"), "The Gold-Giving Serpent",
            "The Son of Seven Queens", "A Lesson for Kings", "Pride Goeth Before a Fall", "Raja Rasalu",
            "The Ass in the Lion's Skin", "The Farmer and the Money-Lender",
            "The Boy Who Had a Moon on His Forehead and a Star on His Chin", "The Prince and the Fakir", "Why the Fish Laughed",
            "The Demon with the Matted Hair", "The Ivory City and Its Fairy Princess",
            "How Sun, Moon, and Wind Went Out to Dinner", "How the Wicked Sons Were Duped", "The Pigeon and the Crow",
        ),
        rating=4.5, start=r"Covent", end=r"^Notes and References$",
    ),
    StoryBook(
        30635, "the-talking-thrush", "The Talking Thrush", [("william-crooke", "William Crooke"), ("w-h-d-rouse", "W. H. D. Rouse")],
        1899, "childrens",
        "Forty-three short animal stories from northern India — jackals, monkeys, crows and a very clever thrush — "
        "collected by William Crooke and retold for children.",
        _titles(
            "The Talking Thrush", "The Rabbit and the Monkey", "The Sparrow's Revenge", "The Judgment of the Jackal",
            "How the Mouse Got into His Hole", "King Solomon and the Owl", "The Camel's Neck",
            "The Quail and the Fowler", "The King of the Kites", "The Jackal and the Camel", "The Wise Old Shepherd",
            "Beware of Bad Company", "The Foolish Wolf", "Reflected Glory", "The Cat and the Sparrows",
            "The Foolish Fish", "The Clever Goat", "A Crow Is a Crow for Ever", "The Grateful Goat",
            S("The Cunning Jackal", "The Cunning Jackal; or, the Biter Bit", absorb_subtitle=True), "The Farmer's Ass", "The Parrot Judge", "The Frog and the Snake",
            "Little Miss Mouse and Her Friends", "The Jackal That Lost His Tail", "The Wily Tortoise",
            "The King of the Mice", "The Valiant Blackbird", "The Goat and the Hog", "The Parrot and the Parson",
            "The Lion and the Hare", "The Monkey's Bargains", "The Monkey's Rebuke", "The Bull and the Bullfinch",
            "The Swan and the Crow", "Pride Shall Have a Fall", "The Kid and the Tiger",
            "The Stag, the Crow, and the Jackal", "The Monkey and the Crows", "The Swan and the Paddy-Bird",
            "What Is a Man?", "The Wound and the Scar", "The Cat and the Parrot",
        ),
        rating=4.4, start=r"^FINIS", end=r"^Notes$",
    ),
    StoryBook(
        6145, "tales-of-the-punjab", "Tales of the Punjab", [("flora-annie-steel", "Flora Annie Steel")], 1894, "folk-tales",
        "Forty-three folk tales told in the villages of the Punjab, from tiny Sir Buzz to the adventures of the "
        "hero Raja Rasalu.",
        _titles(
            "Sir Buzz", "The Rat's Wedding", "The Faithful Prince", "The Bear's Bad Bargain",
            "Prince Lionheart and His Three Friends", "The Lambikin", "Bopoluchi", "Princess Aubergine",
            "Valiant Vicky, the Brave Weaver", "The Son of Seven Mothers", "The Sparrow and the Crow",
            "The Tiger, the Brahman, and the Jackal", "The King of the Crocodiles", "Little Anklebone",
            S("The Close Alliance", absorb_subtitle=True), "The Two Brothers", "The Jackal and the Iguana",
            "The Death and Burial of Poor Hen-Sparrow", "Princess Pepperina", "Peasie and Beansie",
            "The Jackal and the Partridge", "The Snake-Woman and King Ali Mardan", "The Wonderful Ring",
            "The Jackal and the Pea-Hen", "The Grain of Corn", "The Farmer and the Money-Lender", "The Lord of Death",
            S("The Wrestlers", absorb_subtitle=True), "The Legend of Gwashbrari, the Glacier-Hearted Queen",
            "The Barber's Clever Wife", "The Jackal and the Crocodile", "How Raja Rasalu Was Born",
            "How Raja Rasalu Went Out into the World", "How Raja Rasalu's Friends Forsook Him",
            "How Raja Rasalu Killed the Giants", "How Raja Rasalu Became a Jogi",
            "How Raja Rasalu Journeyed to the City of King Sarkap",
            "How Raja Rasalu Swung the Seventy Fair Maidens, Daughters of the King",
            "How Raja Rasalu Played Chaupur with King Sarkap", "The King Who Was Fried", "Prince Half-a-Son",
            "The Mother and Daughter Who Worshipped the Sun", "The Ruby Prince",
        ),
        rating=4.4, start=r"^FOLKLORE OF INDIA", end=r"^NOTES TO TALES",
    ),
    StoryBook(
        38488, "folk-tales-of-bengal", "Folk-Tales of Bengal", [("lal-behari-day", "Lal Behari Day")], 1883, "folk-tales",
        "Twenty-two tales told by Bengali grandmothers — rakshasas, ghosts, clever jackals and princes on quests — "
        "written down by Lal Behari Day.",
        _titles(
            "Life's Secret", "Phakir Chand", "The Indigent Brahman", "The Story of the Rakshasas",
            "The Story of Swet-Basanta", "The Evil Eye of Sani", "The Boy Whom Seven Mothers Suckled",
            "The Story of Prince Sobur", "The Origin of Opium", "Strike But Hear",
            "The Adventures of Two Thieves and of Their Sons", "The Ghost-Brahman", "The Man Who Wished to Be Perfect",
            "A Ghostly Wife", "The Story of a Brahmadaitya", "The Story of a Hiraman", "The Origin of Rubies",
            "The Match-Making Jackal", "The Boy with the Moon on His Forehead",
            "The Ghost Who Was Afraid of Being Bagged", "The Field of Bones", "The Bald Wife",
        ),
        rating=4.4, start=r"^ILLUSTRATIONS$", end=r"^NOTES$",
    ),
    StoryBook(
        36696, "old-deccan-days", "Old Deccan Days", [("mary-frere", "Mary Frere")], 1868, "folk-tales",
        "Twenty-four Hindu fairy legends of southern India, as told to Mary Frere by her ayah, Anna Liberata de "
        "Souza — including Punchkin, Brave Seventee Bai and the Valiant Chattee-Maker.",
        [S("The Collector's Apology"), S("The Narrator's Narrative")] + _titles(
            "Punchkin", "A Funny Story", "Brave Seventee Bai", "Truth's Triumph",
            "Rama and Luxman; or, the Learned Owl", "Little Surya Bai", "The Wanderings of Vicram Maharajah",
            "Less Inequality Than Men Deem", "Panch-Phul Ranee",
            "How the Sun, the Moon and the Wind Went Out to Dinner", "Singh Rajah and the Cunning Little Jackals",
            "The Jackal, the Barber and the Brahmin Who Had Seven Daughters", "Tit for Tat",
            "The Brahmin, the Tiger and the Six Judges", "The Selfish Sparrow and the Houseless Crows",
            "The Valiant Chattee-Maker", "The Rakshas' Palace", "The Blind Man, the Deaf Man and the Donkey",
            "Muchie Lal", "Chundun Rajah", "Sodewa Bai", "Chandra's Vengeance",
            "How the Three Clever Men Outwitted the Demons", "The Alligator and the Jackal",
        ),
        rating=4.3, start=r"^INTRODUCTION\.$", end=r"^NOTES ON THE NARRATOR",
    ),
    StoryBook(
        37002, "tales-of-the-sun", "Tales of the Sun", [("georgiana-kingscote", "Mrs. Howard Kingscote"), ("natesa-sastri", "Pandit Natesa Sastri")],
        1890, "folk-tales",
        "Folk tales of southern India: three deaf men, a Brahmin girl who married a tiger, a monkey with a tom-tom "
        "and the eight robbers outwitted by Chandralekha.",
        _titles(
            "The Story of the Three Deaf Men", "Why Brahmans Cannot Eat in the Dark", "The Soothsayer's Son",
            "Ranavirasing", "Charity Alone Conquers", S("Vidamundan Kodamundan", absorb_subtitle=True),
            S("Vayalvallan Kaiyavalla", absorb_subtitle=True), "The Mother-in-Law Became an Ass",
            "The Brahmin Girl That Married a Tiger", "The Good Husband and the Bad Wife",
            "The Good Wife and the Bad Husband", "The Lost Camel and Other Tales", "Eating Up the Protector",
            "The Monkey with the Tom-Tom", "Pride Goeth Before a Fall", "Good Will Grow Out of Good",
            "Light Makes Prosperity", "Chandralekha and the Eight Robbers", "The Conquest of Fate",
            "The Brahman Priest Who Became an Amildar", "The Gardener's Cunning Wife", "Keep It for the Beggar",
            "Good Luck to the Lucky One; or, Shall I Fall Down?", "Retaliation—Palikkuppali",
            "The Beggar and the Five Muffins", "The Brahmarakshas and the Hair",
        ),
        rating=4.2, start=r"^FOLKLORE IN SOUTHERN INDIA", end=r"^NOTES$",
    ),
    StoryBook(
        34757, "mashi-and-other-stories", "Mashi and Other Stories", [("rabindranath-tagore", "Rabindranath Tagore")],
        1918, "classics",
        "Fourteen short stories by Rabindranath Tagore, translated from the Bengali — among them The Postmaster, "
        "Subha and The Skeleton — full of quiet feeling for ordinary lives in Bengal.",
        _titles(
            "Mashi", "The Skeleton", "The Auspicious Vision", "The Supreme Night", "Raja and Rani",
            "The Trust Property", "The Riddle Solved", "The Elder Sister", "Subha", "The Postmaster",
            "The River Stairs", "The Castaway", "Saved", "My Fair Neighbour",
        ),
        rating=4.6, start=r"^CONTENTS$", end=r"^THE END$", extra_categories=["indian-literature", "fiction"],
    ),
    StoryBook(
        48511, "vikram-and-the-vampire", "Vikram and the Vampire", [("richard-f-burton", "Richard F. Burton")],
        1870, "classics",
        "King Vikram must carry a vampire, the Baital, to a wicked sorcerer — but the vampire tells him a riddling "
        "story on every journey. The classic Vikram–Betaal tales in Richard Burton's version.",
        [S("Introduction")] + [
            S(f"The Vampire's {ordinal} Story", absorb_subtitle=True)
            for ordinal in ("First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth",
                            "Tenth", "Eleventh")
        ] + [S("Conclusion")],
        rating=4.3, start=r"^VIKRAM AND THE VAMPIRE\.$", extra_categories=["indian-literature", "fantasy"],
    ),
]
