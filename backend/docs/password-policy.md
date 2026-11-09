# SecureGuard password policy

- Passwords must contain at least 12 Unicode characters.
- Passwords may contain spaces and any Unicode characters; uppercase, digit, and symbol combinations are not required.
- Passwords may contain no more than 72 UTF-8 bytes because the current password hashing uses bcrypt.
- New passwords must differ from the current password.
- Initial passwords are supplied by an authorized account administrator. Password reset passwords are also supplied by an authorized administrator and must be delivered to the user through a separate secure channel. The API never returns a password.
- Passwords are stored as bcrypt hashes using 12 rounds. Passwords and tokens must not be written to logs.
