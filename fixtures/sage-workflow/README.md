Synthetic documents for the architecture-first Sage workflow.

All files use external reference `GHOACRUGOL051926` and are test data only.
They intentionally avoid real customer information. `FixtureSourceAdapter`
returns equivalent normalized content through the same interface used by
`GmailSourceAdapter`.

To test Gmail:

1. Email these files to the connected Gmail account.
2. Apply the Gmail label `Synpath Sage Demo`.
3. Open Synpath, choose **Gmail + Dry Run**, and sync with:
   `label:"Synpath Sage Demo" has:attachment`
4. Select the matching messages and load the workflow.
