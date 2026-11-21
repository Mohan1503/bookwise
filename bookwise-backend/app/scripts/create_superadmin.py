from __future__ import annotations

import getpass
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.database.session import SessionLocal
from app.dependencies.auth import hash_password
from app.models.role import Role, UserRole
from app.models.user import User

SUPERADMIN_ROLE = "superadmin"


def main() -> int:
    try:
        email = str(TypeAdapter(EmailStr).validate_python(input("Superadmin email: ").strip())).lower()
    except ValidationError:
        print("Enter a valid email address.", file=sys.stderr)
        return 1

    full_name = input("Superadmin full name: ").strip()
    if len(full_name) < 2:
        print("Name must contain at least two characters.", file=sys.stderr)
        return 1

    password = getpass.getpass("Superadmin password (12+ characters): ")
    if len(password) < 12:
        print("Password must contain at least 12 characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        existing_admin = db.execute(
            select(User.id)
            .join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.name == SUPERADMIN_ROLE)
        ).scalar_one_or_none()
        if existing_admin is not None:
            print("A superadmin account already exists; refusing to create another.", file=sys.stderr)
            return 1

        existing_user = db.execute(select(User.id).where(User.email == email)).scalar_one_or_none()
        if existing_user is not None:
            print("That email already belongs to an account; no role was changed.", file=sys.stderr)
            return 1

        role = db.execute(select(Role).where(Role.name == SUPERADMIN_ROLE)).scalar_one_or_none()
        if role is None:
            role = Role(name=SUPERADMIN_ROLE, description="BookWise superadministrator")
            db.add(role)
            db.flush()

        user = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            is_active=True,
        )
        user.user_roles.append(UserRole(role=role))
        db.add(user)
        db.commit()

    print(f"Superadmin account created for {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
