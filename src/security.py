import os
import time
import secrets
import logging
import hashlib
import jwt

logger = logging.getLogger("SecurityModule")

def get_jwt_secret() -> str:
    """
    Secure JWT Secret resolution:
    Checks environment variable JWT_SECRET_KEY, then local jwt_secret.txt.
    If absent, generates an ephemeral cryptographically strong secret key and logs warning.
    (Enforces rule against hardcoded secrets or insecure fallbacks).
    """
    if os.getenv('JWT_SECRET_KEY'):
        return os.getenv('JWT_SECRET_KEY')
    secret_file = os.path.join(os.path.dirname(__file__), '..', 'jwt_secret.txt')
    if os.path.exists(secret_file):
        try:
            with open(secret_file, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except Exception:
            pass
    logger.warning("JWT_SECRET_KEY not set. Generating ephemeral 32-byte secret for session security.")
    return secrets.token_hex(32)

JWT_SECRET = get_jwt_secret()
ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    """
    Hash password using SHA-256 with per-user salt.
    """
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f"{salt.hex()}:{key.hex()}"

def verify_password(stored_password_hash: str, provided_password: str) -> bool:
    """
    Verify password against stored salt:hash format.
    """
    try:
        salt_hex, key_hex = stored_password_hash.split(':')
        salt = bytes.fromhex(salt_hex)
        expected_key = bytes.fromhex(key_hex)
        key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
        return secrets.compare_digest(key, expected_key)
    except Exception:
        return False

def create_jwt_token(data: dict, expires_delta_seconds: int = 86400) -> str:
    """
    Issue JWT token with explicit exp claim and algorithm.
    """
    to_encode = data.copy()
    expire = int(time.time()) + expires_delta_seconds
    to_encode.update({"exp": expire, "iat": int(time.time())})
    token = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
    return token

def decode_jwt_token(token: str) -> dict:
    """
    Decode and validate JWT token with hardcoded algorithm verification.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError as e:
        logger.error(f"JWT Verification failed: {e}")
        return None
