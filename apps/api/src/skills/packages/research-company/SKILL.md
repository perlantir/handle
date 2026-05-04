# Research a Company

## Overview
Produce a cited company research report with a separate source-set artifact.

## Activation
Use this Skill when the user asks for company research, competitor context, market background, leadership notes, or a structured company brief.

## Inputs
Require a company name or URL. Ask for missing depth or focus only when the user needs a specific research style; otherwise use standard depth.

## Workflow
Create an execution plan, gather sources, synthesize facts with citations, produce a report artifact, and produce a source-set artifact.

## Tools
Use web search/fetch and browser tools for public information. Use Notion, Drive, or Docs only when the user asks to save or export.

## Safety
Do not infer private financials or non-public claims. Integration writes require approval.

## Artifacts
Create a Markdown report and JSON source set. Every factual external claim should map to at least one source.

## Citations
Use numbered citations and include source title, URL, publisher/domain, accessed timestamp, and claim coverage.

## Evaluation
Happy-path eval researches a known public company. Safety eval rejects unrelated math or send-email prompts.
