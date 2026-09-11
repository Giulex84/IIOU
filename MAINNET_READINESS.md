# IIOU Mainnet Readiness

IIOU Testnet is the permanent validation environment. Mainnet must be a **separate Pi application and deployment**, paired to this Testnet app only after the gates below are satisfied.

## Product gates

- Core ledger lifecycle is stable: proposed → accepted → payment_claimed → settled.
- Decline and cancel terminal states work correctly.
- Activity Center, settlement receipt, due-date states and archive behavior are stable on mobile Pi Browser.
- Partial-payment records remain two-sided: debtor claims, creditor confirms/rejects.
- No Testnet simulator or owner-only review controls are shipped as a user-facing Mainnet feature.
- Copy clearly explains that IIOU is record keeping, not lending, escrow, custody, dispute arbitration or a money transmitter.

## Identity and authorization gates

- Pi Authentication is the only login method.
- Every protected backend mutation verifies the Pi access token with `/v2/me`.
- Browser-provided usernames/UIDs are never trusted as the source of identity.
- Each IOU can only be read or changed by its verified participants.

## Payment gates

- U2A payment approval and completion are server-side.
- Payment ownership, direction, network, amount, memo and metadata are validated before approval/completion.
- Completion requires matching txid plus Pi `developer_completed` and `transaction_verified` state.
- Payment callbacks are idempotent and audited persistently.
- Mainnet payment constants must explicitly require `Pi Network`, never `Pi Testnet`.
- Mainnet Server API key and wallet configuration must be completely separate from Testnet.
- A2U must remain disabled unless a concrete product use case is approved and implemented with current Pi Platform rules.

## Data and privacy gates

- Redis keys remain namespaced to IIOU.
- Only minimum account/ledger/payment metadata is stored.
- Wallet passphrases/seeds are never requested from users or exposed client-side.
- Privacy Policy and Terms match the final Mainnet data model and payment behavior.
- Before Mainnet launch, define a practical account/data deletion workflow consistent with any required ledger/security retention.

## Operational gates

- Production uses a currently supported Node.js runtime.
- No secrets are committed to Git.
- `PI_API_KEY`, storage tokens and any wallet secret are server-only environment variables.
- A clean deploy can be reproduced from `main`.
- Testnet login, IOU creation, lifecycle simulation, persistence and U2A payment are re-tested after final release candidate changes.

## Mainnet creation sequence

1. Freeze a Testnet release candidate.
2. Create a new Pi Mainnet application in Developer Portal.
3. Pair it to the IIOU Testnet application.
4. Create/configure Mainnet-specific app wallet and Server API key.
5. Create a separate Mainnet deployment/repository or protected Mainnet branch with `sandbox:false` and `Pi Network` payment validation.
6. Configure Mainnet Privacy/Terms URLs and final listing copy/assets.
7. Perform Mainnet-safe authentication and non-payment smoke tests.
8. Enable only the payment features permitted and required for the Mainnet product.
9. Submit listing/review only after all gates above are complete.

## Domain

The purchased product domain can be connected only after the final Testnet/Mainnet routing plan is decided. Keep Testnet and Mainnet distinguishable so reviewers and users cannot confuse networks.
