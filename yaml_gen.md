# Gemini Marking Engine: Prompt & Implementation Guide

This document defines the specialized "Marking Engine" prompt and the resulting YAML data structure. This "handshake" allows Gemini’s AI analysis to be parsed and injected directly into the NAS-based Study Vault database. 

---

## 1. The Prescriptive Marking Prompt
Copy and paste the entire block below into Gemini. For the best results, upload the **Exam Paper PDF**, the **Mark Scheme PDF**, and the **Student Attempt (Scan/Photos)** simultaneously.

> **Role:** You are a senior A-Level Examiner specializing in [Insert Subject: Business/Psychology].
>
> **Task:** Grade the attached "Student Attempt" by cross-referencing it against the provided "Mark Scheme" and "Exam Paper".
>
> **Strict Grading Rules:**
> 1. **Keyword Accuracy:** Do not award marks for vague answers. If the mark scheme requires specific terminology (e.g., "Price Elasticity" or "Self-Actualization"), the student must use that term or a precise technical synonym.
> 2. **Contextualization:** For Business papers, ensure the student has applied their answer to the specific case study provided.
> 3. **Mark Totals:** The maximum raw marks for this paper is **[Insert: 80 for Business / 70 for Psychology]**.
>
> **Output Requirements:**
> Provide a detailed question-by-question breakdown in prose first. Then, at the very end of your response, you **MUST** provide a summary in the following exact YAML format (include the code fence). Include **every marked question** in `questions`, and complete the `qa` self-check.
>
> ```yaml
> score: [Integer 0-100 percentage]
> feedback_summary: "[One-sentence overview]"
> strengths: ["Point 1", "Point 2"]
> weaknesses: ["Point 1", "Point 2"]
> questions:
>   - question_id: "1a"
>     marks_awarded: 3
>     marks_available: 4
>     brief_rationale: "[Why this mark]"
>   - question_id: "1b"
>     marks_awarded: 2
>     marks_available: 2
>     brief_rationale: "[...]"
> qa:
>   raw_total_awarded: [sum of marks_awarded]
>   raw_total_available: [max raw marks for paper]
>   percentage_recomputed: [integer 0-100 from totals]
>   math_consistent: true
>   notes: "[Any caveat, or empty string]"
> ```

---

## 2. YAML Data Structure Description
The YAML block acts as the API bridge. The app parses it with **js-yaml** in [`js/domain/yamlMarking.js`](js/domain/yamlMarking.js) (see also [`js/main.js`](js/main.js) for **Log result** and vault historic paste).

| Field | Type | Function |
| :--- | :--- | :--- |
| `score` | **Integer** | Percentage 0–100; stored on `papers.score`. |
| `feedback_summary` | **String** | Mapped to PocketBase `ai_summary`. |
| `strengths` | **Array** | Shown in marking detail panel. |
| `weaknesses` | **Array** | Shown in marking detail panel. |
| `questions` | **Array** | Per-question marks and rationale (displayed in UI). |
| `qa` | **Object** | Self-check: totals and `math_consistent`. If `math_consistent` is `false`, or sums disagree, the UI warns before save. |

---

## 3. The "Grading Handshake" Workflow

When you paste Gemini's output into **Log result** (or the vault **historic YAML** box):

1. **Parse:** YAML is extracted from a fenced block if present, then parsed with js-yaml.
2. **QA:** Warnings if `qa.math_consistent` is false or question totals disagree with `qa.raw_total_awarded`.
3. **Database patch:** `score`, `status` (graded terminal state — see [`schema-contract.md`](schema-contract.md)), `full_yaml`, `ai_summary` are sent to PocketBase `papers`.
4. **Boundary cross-check:** Letter grade uses `paper_type` → `boundaries.paper_key` and raw mark thresholds.
5. **UI:** Heatmap and performance chart treat the paper as graded; marking detail expands from parsed `questions` / `qa`.

---

## Pro-tip: Forcing accuracy
Gemini can occasionally be lenient or lose track of totals. Use this follow-up if the score feels off:

**The "Math-Check" follow-up:**
> *"Re-calculate the total marks. There are [X] marks available in Section A and [Y] marks in Section B. Show your addition clearly, then update the YAML `questions`, `qa.raw_total_*`, `percentage_recomputed`, and `score` so they are consistent. Set `qa.math_consistent` to true only if everything agrees."*
