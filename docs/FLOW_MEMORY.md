# Flow Memory

Flow memory stores stable screen checkpoints so later test runs can skip already-known setup steps.

## Storage

```text
.mobiloop/flow/memory.json
```

## Signature Inputs

- visible text
- accessibility labels
- content descriptions
- resource ids
- class names
- clickable text

## Quality Rules

Good checkpoints:

- have stable resource ids or accessibility labels
- are not loading screens
- avoid dynamic dates, prices, counters, and random ids
- include a semantic action to the next checkpoint

Weak checkpoints:

- match only generic text like `OK`
- are mostly empty splash screens
- contain dynamic server data
- rely on coordinates

## Score Guidance

| `minimumScore` | Use                                                     |
| -------------- | ------------------------------------------------------- |
| `0.50`         | Exploratory local replay.                               |
| `0.65`         | Normal smoke replay.                                    |
| `0.75`         | CI replay for stable screens.                           |
| `0.85`         | High confidence only; may reject valid UI copy changes. |
