from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
import math
import re
import string

FUNCTION_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "if", "in", "into", "is", "it", "not", "of", "on", "or",
    "that", "the", "to", "was", "we", "with", "you",
}


@dataclass(frozen=True)
class StyleMetrics:
    function_word_similarity: float
    char_ngram_similarity: float
    punctuation_similarity: float
    sentence_rhythm_similarity: float
    lexical_similarity: float
    paragraph_similarity: float
    aggregate_similarity: float

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


def _tokens(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"[.!?]+", text) if part.strip()]


def _cosine(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0
    overlap = set(left) & set(right)
    numerator = sum(left[item] * right[item] for item in overlap)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def _counter_similarity(left_items: list[str], right_items: list[str]) -> float:
    return round(_cosine(Counter(left_items), Counter(right_items)), 6)


def _char_ngrams(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    grams: list[str] = []
    for size in (3, 4, 5):
        grams.extend(normalized[index:index + size] for index in range(max(0, len(normalized) - size + 1)))
    return grams


def _sentence_lengths(text: str) -> list[str]:
    lengths = [len(_tokens(sentence)) for sentence in _sentences(text)]
    return [str(min(40, (length // 5) * 5)) for length in lengths]


def _paragraph_lengths(text: str) -> list[str]:
    lengths = [len(_tokens(paragraph)) for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    return [str(min(200, (length // 25) * 25)) for length in lengths]


def score_style_evidence(completion: str, references: list[str], profile_targets: str = "") -> StyleMetrics:
    reference_text = "\n\n".join(references)
    combined_reference = f"{reference_text}\n\n{profile_targets}".strip()
    completion_tokens = _tokens(completion)
    reference_tokens = _tokens(combined_reference)

    function_word_similarity = _counter_similarity(
        [token for token in completion_tokens if token in FUNCTION_WORDS],
        [token for token in reference_tokens if token in FUNCTION_WORDS],
    )
    char_ngram_similarity = _counter_similarity(_char_ngrams(completion), _char_ngrams(combined_reference))
    punctuation_similarity = _counter_similarity(
        [character for character in completion if character in string.punctuation],
        [character for character in combined_reference if character in string.punctuation],
    )
    sentence_rhythm_similarity = _counter_similarity(_sentence_lengths(completion), _sentence_lengths(combined_reference))
    lexical_similarity = _counter_similarity(completion_tokens, reference_tokens)
    paragraph_similarity = _counter_similarity(_paragraph_lengths(completion), _paragraph_lengths(combined_reference))

    aggregate = round(
        0.2 * function_word_similarity
        + 0.25 * char_ngram_similarity
        + 0.15 * punctuation_similarity
        + 0.15 * sentence_rhythm_similarity
        + 0.15 * lexical_similarity
        + 0.1 * paragraph_similarity,
        6,
    )

    return StyleMetrics(
        function_word_similarity=function_word_similarity,
        char_ngram_similarity=char_ngram_similarity,
        punctuation_similarity=punctuation_similarity,
        sentence_rhythm_similarity=sentence_rhythm_similarity,
        lexical_similarity=lexical_similarity,
        paragraph_similarity=paragraph_similarity,
        aggregate_similarity=aggregate,
    )
