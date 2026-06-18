from app.providers.normalization import aliases_for_name, normalize_text


def test_normalize_text_removes_noise() -> None:
    assert normalize_text("DB Bench-Press!") == "db bench press"


def test_aliases_include_rdl() -> None:
    assert "rdl" in aliases_for_name("Romanian Deadlift")
