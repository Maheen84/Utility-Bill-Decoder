# Utility Bill Decoder

Electricity bills in Pakistan are hard to read. They mix tariff slabs, taxes, fuel adjustments and dozens of line items, and every provider lays them out differently. Utility Bill Decoder is an AI assistant that reads a bill from a photo or screenshot, pulls out its details as structured data, and explains the bill in plain English.

It supports bills from **K-Electric**, **LESCO** and **IESCO**, including tilted photos, partly Urdu layouts, and bills where personal details are covered by grey boxes.

## What it does

**Level 1: Extraction.** For each bill image it returns one JSON object with the provider, tariff, sanctioned load, dates, meter readings, units, every charge and tax line, the printed subtotals, arrears, and the amounts payable before and after the due date. Personal identifiers (names, addresses, account and meter numbers) are never returned.

**Level 2: Questions.** Customers can ask questions about their bill and get a specific answer grounded in what the bill shows. For example, on a K-Electric bill:

> **How much of my bill is taxes?**
> Taxes on your bill total PKR 569.62, which is 16.61% of your current bill amount of PKR 3,430.24. This includes Electricity Duty of PKR 29.41, Sales Tax of PKR 520.21, and MUCT (KMC) of PKR 20.00.

> **How many months in my history went above 200 units?**
> There are 2 months that went above 200 units: July 2025 at 239 units and August 2025 at 203 units.

If the bill does not show something, the answer says so instead of guessing. Estimates are labelled as estimates, and ambiguous questions state the interpretation that was used.

## Two ways to use it

- **Web app:** upload a bill, see the extracted summary, charges, taxes and usage history, then ask questions in a chat box and get answers in a few seconds.
- **Batch runner:** point it at a folder of bill images and the two CSV templates, and it writes the completed `level1.csv` and `level2.csv`.

Both use the same core code, so the web app behaves exactly like the batch run.

## How it works

```
bill image
   ├─► extractBill()    → Level 1 JSON (validated against a schema)
   ├─► extractHistory() → monthly usage and billing history
   └─► answerQuestion() → plain-English answer
```

A vision-language model reads the image, but anything that must be exact is handled by ordinary code. These are the main design decisions:

**1. Extraction follows the rules, and code double-checks it.**
The model's output is validated against a schema (zod), and checked for consistency:
- the reading date must fall shortly before the issue date, and the due date cannot come before the issue date;
- the charge lines must add up to the printed charges subtotal, and the tax lines to the printed tax subtotal.

If a check fails, the model is asked to read the bill again with the specific problem pointed out. Values are always copied as printed and never recalculated.

**2. Layouts that print only a combined tax figure.**
Some bills (for example IESCO) print a single tax total with no breakdown. The model reports whether the bill prints named tax lines, and the code then applies the rule: if it doesn't, `taxes` is empty and the figure goes into `total_taxes`. Lines with no amount are dropped.

**3. History is read separately.**
Questions like "how many months went above 200 units?" need the usage and billing history tables, which are not part of the Level 1 schema. The usage table and the billing table are read as two independent lists and merged by code, which avoids months being misaligned.

**4. The model never does the maths.**
For every calculated number (averages, differences, counts, percentages) the model writes a formula, and the code evaluates it with math.js and inserts the result. Words such as "higher" and "lower" are also chosen by the code from the sign of the difference, so an answer can't contradict its own numbers.

**5. It never fails silently.**
In batch mode, a failed step for one bill is logged and replaced with null values or a fallback sentence, so the output files are always valid and complete. Progress is saved after every bill.

## Getting started

**Requirements:** Node.js 22 or later (tested with Node.js 22). Dependencies are pinned in `package.json` and `package-lock.json`.

```bash
npm install
cp .env.example .env     # on Windows PowerShell: copy .env.example .env
```

Open `.env` and replace the placeholder with your own Google AI Studio (Gemini) API key. Free keys are available at https://aistudio.google.com.

| Variable | Purpose | Value used |
|---|---|---|
| `MODEL_PROVIDER` |
