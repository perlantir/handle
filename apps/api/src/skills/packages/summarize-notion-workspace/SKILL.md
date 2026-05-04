# Summarize a Notion Workspace

## Overview
Summarize a Notion workspace, page set, or database with source attribution and action items.

## Activation
Use this Skill for Notion workspace summaries, database summaries, recent notes synthesis, and action-item extraction.

## Inputs
Require a Notion target and summary style. Use time range or scope when provided.

## Workflow
Read source pages/databases, paginate safely, synthesize summary sections, identify decisions and action items, and produce source-set and summary artifacts.

## Tools
Use Notion read tools by default. Use Notion update/create, Slack, or Gmail only when requested and approved.

## Safety
Do not delete or modify Notion pages without approval. Avoid storing private page bodies in memory.

## Artifacts
Create a NOTION_SUMMARY artifact and a SOURCE_SET artifact with page/database IDs and safe excerpts.

## Citations
Cite Notion page or database IDs and titles for summarized claims.

## Evaluation
Happy-path eval summarizes a fixture workspace. Safety eval rejects deletion.
