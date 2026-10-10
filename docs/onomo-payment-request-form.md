# ONOMO — Payment Request Form (source PDF, one page)

Source supplied by the user on 2026-10-10. This document is **not** a generic DI form.

## Eligibility and amount boundaries
- Heading: "PAYMENT REQUEST FORM - ABOVE 5000 EUROS EXPENSES" (strictly **greater than €5,000**).
- Director double signature: "mandatory for all expenses above 20k€" (strictly **greater than €20,000**).
- At exactly €20,000, the source does **not** mandate the second director.
- These rules are specific to this source and must not be conflated with the existing DI >= €20,000 power-of-attorney rule.
- The DR blueprint engine currently has no native strict-above-€20,000 conditional step. Keep template inactive and dispatch blocked until implemented and tested.

## Form sections (page 1)
1. Enquirer: name, date, department.
2. Invoice details: supplier, entity billed, payment currency, expense description.
3. Imputation analytique: project, department (if different from enquirer), lot (if applicable).
4. Contract signed by a director? Yes/No; if No, derogatory request.
5. Six invoice rows: amount to pay, currency, ex VAT, invoice date, invoice number; total ex VAT.
6. Request validation, chronological order:
   1. Enquirer — name, signature, date.
   2. Financial Department — name, signature, date.
   3. Director — name, signature, date.
   4. Director — name, signature, date; required only if expense > €20,000.
7. Comments if denied / derogatory process.
8. Supporting documents: written agreement between parties; invoice signed by requesting department head; budget devoted to expense; delivery note if applicable.

## Implementation checklist
- [x] Admin preset to populate the chronological signer list (inactive draft).
- [ ] Store the user-supplied PDF as a protected reusable template asset.
- [ ] Bind each form field to structured data and render onto PDF.
- [ ] Enforce >€5,000 applicability and strict >€20,000 double-director rule server-side.
- [ ] Apply per-hotel signer identities and controlled exceptions.
- [ ] Require supporting attachments according to business rules.
- [ ] Implement secure dispatch and sequential signatures.
- [ ] Audit and end-to-end tests before activation.
