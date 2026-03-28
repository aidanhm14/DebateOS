---
name: case-prep
description: >
  Generate a structured debate case for APDA parliamentary debate. Use when the user
  asks to "prep a case", "build a case", "generate arguments for", "write a gov case",
  "write an opp case", "case prep for [motion]", or provides a debate motion/resolution
  and wants a full case with contentions, evidence, and structure.
metadata:
  version: "0.1.0"
---

# Case Prep for APDA Parliamentary Debate

Generate a complete, competition-ready debate case. Tailor output to the side (Government or Opposition) and the motion provided.

## Case Structure

Every case must include:

1. **Interpretation / Framework** -- Define the motion clearly. For Gov, set the terms of the debate. For Opp, challenge or narrow the framing if strategically useful.

2. **Thesis** -- A single clear sentence stating the core claim.

3. **Contentions** (2-3 per case)
   Each contention includes:
   - A clear tag line (the argument in one sentence)
   - A warrant (the logical reasoning)
   - Supporting evidence or examples (real-world data, historical precedent, philosophical grounding)
   - Impact analysis (why this matters, who is affected, what is the magnitude)

4. **Key Definitions** -- Define any ambiguous terms in the motion to control the debate.

5. **Preemptive Responses** -- Anticipate the strongest 2-3 arguments the other side will make and briefly address them.

## APDA Format Context

Read `references/apda-format.md` for detailed rules on APDA parliamentary debate structure, speech order, point of information rules, and strategic considerations.

## Output Guidelines

- Write in a persuasive, confident tone suitable for oral delivery
- Use short punchy sentences that sound natural when spoken aloud
- Bold the tag lines for each contention
- Include specific examples (countries, policies, historical events, studies) rather than vague claims
- Adapt depth based on user preference: "quick" = outline with tag lines, "standard" = full case, "deep" = full case plus extended evidence and counterargument prep

## When the user provides a motion

1. Identify whether they want Gov or Opp (ask if unclear)
2. Analyze the motion for key tensions, stakeholders, and definitional questions
3. Build the strongest possible case for the requested side
4. Flag any definitional traps or strategic pitfalls in the motion

## When the user wants practice

Generate 3 diverse motions across different topic areas (politics, philosophy, economics, social policy) and offer to build a case for any of them.
