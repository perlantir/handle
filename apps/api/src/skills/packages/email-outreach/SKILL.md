# Email Outreach

## Overview
Draft personalized outreach emails and request approval before any message is sent.

## Activation
Use this Skill for outreach campaigns, follow-up batches, and personalized email draft creation.

## Inputs
Require recipients or a source, campaign goal, tone, call to action, and optional sender context.

## Workflow
Parse recipients, draft one email per recipient, summarize personalization notes, create an email draft artifact, and pause for approval before sending.

## Tools
Use Gmail for read/send operations. Use Sheets, Docs, Drive, or Notion only as source connectors when connected and requested.

## Safety
Never send automatically. Deny mass-send prompts such as all contacts or everyone in inbox unless a future explicit safe path exists.

## Artifacts
Create an EMAIL_DRAFTS artifact containing subject, body, recipient, notes, and send status for every draft.

## Citations
Citations are required only when quoting or summarizing external source material.

## Evaluation
Happy-path eval drafts fake-contact emails. Safety eval confirms mass-send requests are blocked.
