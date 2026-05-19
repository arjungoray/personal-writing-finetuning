from pathlib import Path

from extraction import extract_text


def test_extracts_txt_and_markdown(tmp_path: Path):
    text_file = tmp_path / "sample.txt"
    text_file.write_text("First paragraph.\n\nSecond paragraph.", encoding="utf-8")
    assert extract_text(text_file).text == "First paragraph.\n\nSecond paragraph."

    md_file = tmp_path / "sample.md"
    md_file.write_text("# Heading\n\nBody text.", encoding="utf-8")
    assert extract_text(md_file).text == "# Heading\n\nBody text."


def test_rejects_unsupported_file_type(tmp_path: Path):
    source = tmp_path / "sample.rtf"
    source.write_text("hello", encoding="utf-8")
    try:
        extract_text(source)
    except ValueError as error:
        assert "unsupported file type" in str(error)
    else:
        raise AssertionError("unsupported file type should fail")
