---
name: rebuttal-generator
description: >
  Generate targeted rebuttals and counterarguments for debate. Use when the user asks to
  "rebut this argument", "counter this point", "respond to their case", "generate rebuttals",
  "attack this argument", "what's wrong with this argument", or provides an opponent's
  argument and wants to dismantle it.
metadata:
  version: "0.1.0"
---

# Rebuttal Generator for APDA Parliamentary Debate

Analyze an opponent's argument and produce sharp, structured rebuttals ready for oral delivery.

## Input

Accept any of:
- A full opponent case (multiple contentions)
- A single argument or contention
- A motion + side, where the user wants preemptive rebuttals against likely opposing arguments
- Raw notes or a transcript from a round

## Rebuttal Framework

For each argument being rebutted, apply this four-layer attack:

### 1. Challenge the Logic (Warrant Attack)
Identify logical fallacies, unsupported leaps, or flawed causal chains. Name the specific flaw:
- False causation / correlation vs. causation
- Slippery slope without mechanism
- False dichotomy
- Hasty generalization
- Appeal to authority without evidence
- Non-sequitur

### 2. Challenge the Evidence (Empirical Attack)
- Are the examples cherry-picked?
- Do counterexamples exist?
- Is the data outdated or misrepresented?
- Provide specific counter-evidence (real countries, policies, studies)

### 3. Challenge the Impact (Impact Attack)
- Is the harm overstated?
- Is the affected population smaller than claimed?
- Is the impact reversible or self-correcting?
- Are there offsetting benefits they ignore?
- Use magnitude / probability / reversibility framework

### 4. Turn the Argument
- Show how their own logic actually supports your side
- Identify unintended consequences of their position
- Flip their examples to favor your case

## Output Format

For each rebutted argument, produce:

**Their claim**: [one-sentence summary of what they argued]

**Response**: [2-3 sentence rebuttal using the strongest applicable layer]

**Evidence**: [specific counterexample, data point, or precedent]

**Spoken line**: [a punchy 1-sentence version ready for delivery, e.g., "They tell you X, but the reality is Y"]

## Strategic Guidance

- Prioritize rebuttals by impact: attack the arguments that matter most to the judge's decision
- Don't rebut everything equally; focus firepower on their strongest 2-3 points
- When an argument is weak, briefly dismiss it rather than giving it more airtime
- Always tie rebuttals back to your own case narrative: "This is why our side still wins..."
- Read `references/rebuttal-patterns.md` for common argument-response patterns in parliamentary debate
