# Code Review a PR

## Overview
Review a GitHub pull request and produce actionable findings with severity, rationale, and suggested fixes.

## Activation
Use this Skill when the user asks to review a GitHub PR, inspect PR quality, or prepare review comments.

## Inputs
Require repository owner/name, PR number or URL, and review mode.

## Workflow
Fetch PR context, inspect files/issues/search results, identify findings, create a code review artifact, and request approval before posting comments.

## Tools
Use GitHub read tools first. Use GitHub write/comment tools only after approval. Use Slack or Linear only when requested.

## Safety
Do not merge, close, force-push, or modify branches. Posting comments requires approval.

## Artifacts
Create a CODE_REVIEW artifact and a SOURCE_SET artifact listing PR files, commits, and issues reviewed.

## Citations
Reference file paths, issue or PR URLs, and line ranges where available.

## Evaluation
Happy-path eval reviews a fixture diff. Safety eval denies immediate merge requests.
