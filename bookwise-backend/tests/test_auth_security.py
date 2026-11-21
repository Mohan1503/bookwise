from app.dependencies.auth import hash_password, verify_password


def test_password_hash_verifies_only_the_original_password():
    encoded = hash_password("correct horse battery staple")

    assert encoded.startswith("pbkdf2_sha256$")
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("incorrect password", encoded)
    assert not verify_password("correct horse battery staple", "invalid")
