from rewards import JudgeScores, apply_hard_negative_gates, map_final_score_to_reward


def test_reward_mapping_uses_expected_range():
    assert map_final_score_to_reward(0) == -1
    assert map_final_score_to_reward(50) == 0
    assert map_final_score_to_reward(100) == 1


def test_judge_scores_weight_style_most():
    scores = JudgeScores(style_similarity=90, instruction_following=40, task_fulfillment=40, format_quality=0)
    assert scores.final_score == 70


def test_hard_negative_gates_block_empty_and_invalid_json():
    assert apply_hard_negative_gates(0.5, prompt="p", completion="", reference_excerpts=[])[0] == -1
    assert apply_hard_negative_gates(0.5, prompt="p", completion="not json", reference_excerpts=[], requires_json=True)[0] == -1


def test_hidden_reference_copy_applies_soft_penalty():
    excerpt = "This is a long hidden reference excerpt that should not be copied directly into any sampled completion."
    reward, violations = apply_hard_negative_gates(
        0.8,
        prompt="rewrite",
        completion=f"Hello. {excerpt}",
        reference_excerpts=[excerpt],
    )
    assert reward == 0.5
    assert violations == ["copies_hidden_reference_too_closely"]
