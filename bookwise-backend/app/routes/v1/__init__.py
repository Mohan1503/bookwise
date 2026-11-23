from fastapi import APIRouter

from app.routes.v1.admin.ai_index import router as admin_ai_index_router
from app.routes.v1.admin.authors import router as admin_authors_router
from app.routes.v1.admin.books import router as admin_books_router
from app.routes.v1.admin.categories import router as admin_categories_router
from app.routes.v1.admin.overview import router as admin_overview_router
from app.routes.v1.admin.publishers import router as admin_publishers_router
from app.routes.v1.ai_reader import router as ai_reader_router
from app.routes.v1.annotations import router as annotations_router
from app.routes.v1.auth import router as auth_router
from app.routes.v1.authors import router as authors_router
from app.routes.v1.books import router as books_router
from app.routes.v1.categories import router as categories_router
from app.routes.v1.publishers import router as publishers_router
from app.routes.v1.reader import router as reader_router
from app.routes.v1.stories import router as stories_router
from app.routes.v1.users import router as users_router
from app.routes.v1.wishlist import router as wishlist_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(books_router)
api_router.include_router(categories_router)
api_router.include_router(authors_router)
api_router.include_router(publishers_router)
api_router.include_router(admin_overview_router)
api_router.include_router(admin_books_router)
api_router.include_router(admin_ai_index_router)
api_router.include_router(admin_authors_router)
api_router.include_router(admin_categories_router)
api_router.include_router(admin_publishers_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(wishlist_router)
api_router.include_router(reader_router)
api_router.include_router(annotations_router)
api_router.include_router(ai_reader_router)
api_router.include_router(stories_router)
