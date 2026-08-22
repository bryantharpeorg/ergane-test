import unittest

from src.validators import NOTE_MAX_CHARS, ValidationError, parse_note


class ParseNoteTestCase(unittest.TestCase):
    """Unit tests for the single note normalization function."""

    def test_trims_leading_and_trailing_whitespace(self):
        self.assertEqual(parse_note("  Lunch with client  "), "Lunch with client")

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_note(""))

    def test_whitespace_only_returns_none(self):
        self.assertIsNone(parse_note("   "))

    def test_none_returns_none(self):
        self.assertIsNone(parse_note(None))

    def test_exactly_max_length_is_accepted(self):
        note = "x" * NOTE_MAX_CHARS
        self.assertEqual(parse_note(note), note)

    def test_one_over_max_length_is_rejected(self):
        note = "x" * (NOTE_MAX_CHARS + 1)
        with self.assertRaises(ValidationError) as cm:
            parse_note(note)
        self.assertEqual(str(cm.exception), "note must be 280 characters or fewer")

    def test_trims_before_measuring_length(self):
        """A 290-character value that trims to 280 characters is accepted."""
        note = "  " + ("x" * 280) + "  "
        self.assertEqual(len(note), 284)
        self.assertEqual(parse_note(note), "x" * 280)

    def test_non_string_is_rejected(self):
        with self.assertRaises(ValidationError) as cm:
            parse_note(42)
        self.assertEqual(str(cm.exception), "note must be text")


if __name__ == "__main__":
    unittest.main()
