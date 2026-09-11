# IIOU Product Roadmap

## Product principle

IIOU should make informal personal obligations clearer without becoming a bank, lender, escrow service, debt collector, or dispute arbiter. The shared ledger is the product; Pi identity makes the counterparties real within the app; Pi payment features should be added only where the official platform supports the flow safely and clearly.

## Testnet v2 — current foundation

- Pi-only authentication with server-side `/v2/me` verification
- Shared IOU creation by Pi username
- Invite claim when the recipient first signs in
- Two-sided acceptance / decline
- Debtor marks paid, creditor confirms settlement
- Active / debtor / creditor / settled views
- Persistent Redis REST storage
- Optional Testnet U2A support payment with hardened server verification
- Incomplete-payment recovery
- Clear non-custodial product scope
- Updated Privacy Policy and Terms
- A2U disabled until app-wallet rotation and a justified product use exist

## Testnet v2.1 — next product layer

- Activity timeline for each IOU
- Partial repayments as ledger events (without custody)
- Counter-offers for amount and due date before acceptance
- Due-soon and overdue states
- Search and filters
- Archive / hide completed records
- User-facing report / block controls for abusive requests
- Rate limits for IOU creation and actions
- Idempotency keys for mutation endpoints
- Better optimistic UI and offline retry handling

## Testnet v2.2 — trust and reliability

- Notification integration using Pi-supported notification capabilities where available
- Security event logging without storing unnecessary personal data
- Data export for a user's own records
- Account-data deletion flow compatible with ledger integrity
- Automated API and state-transition tests
- Deployment health checks
- Accessibility pass and low-end Android performance pass
- Professional Ecosystem listing media and copy

## Pi settlement research gate

A direct Pi settlement feature should only ship if it can be implemented without silently taking custody of another user's repayment funds. Before adding it, confirm the current official Pi SDK / Wallet capabilities, Mainnet eligibility, and any required wallet approvals. If the only available design requires the app to receive a debtor's funds and later forward them to a creditor, that flow should not become the default IIOU settlement model without a separate compliance and risk review.

## Mainnet readiness gate

Create a separate Mainnet app only after:

1. Testnet authentication is stable.
2. Persistent storage is configured and tested with two distinct Pi users.
3. IOU lifecycle permissions are tested end-to-end.
4. The Testnet U2A flow approves and completes correctly with the rotated credentials.
5. Privacy / Terms match the final product behavior.
6. No secrets, wallet passphrases, or third-party webhooks are present in the repository.
7. UI is polished and all controls work on Pi Browser mobile.
8. The separate Mainnet wallet and API key are created and stored safely.
9. Mainnet code uses `sandbox: false` and Mainnet-specific server validation.
10. Testnet and Mainnet deployments use separate environment variables and databases.

## Domain strategy

Keep the current Vercel hostname for Testnet while development is active. Before Mainnet launch, review the purchased `ioupi...` domain against the current Pi trademark / domain rules and choose a clean separation between Testnet and Mainnet endpoints. Never reuse a URL already verified by another Developer Portal app until the portal configuration is intentionally migrated.
