# IIOU Pi Review Checklist — Testnet

This checklist is for validating the current IIOU Testnet release before a separate Mainnet app is created.

## Reviewer path

1. Open the Testnet deployment in Pi Browser.
2. Sign in using **Continue with Pi**.
3. Confirm the dashboard shows the verified Pi username.
4. Create an IOU with amount, counterparty username, note and optional due date.
5. Confirm the IOU remains after refresh/reopen.
6. Open **Activity Center** and inspect the IOU detail/timeline.
7. Verify due-date indicators and remaining balance presentation.
8. For two-user testing, use two real Pioneers. For owner-only development validation, `/test.html` can exercise the lifecycle without bypassing Pi Authentication.
9. Complete the lifecycle: proposed → accepted → payment_claimed → settled.
10. Confirm the settlement receipt shows remaining `0 π` and a complete activity timeline.
11. Optional: use **Support test · 0.1 π** to validate the Testnet U2A flow.

## Payment verification expectations

The backend must reject a payment when any of these do not match the expected Testnet support payment:

- verified Pi user / payment owner
- direction `user_to_app`
- network `Pi Testnet`
- amount `0.1`
- memo `Support IIOU Testnet`
- metadata product `iiou_support`
- transaction id

A completed support payment is accepted as final only when Pi reports both `developer_completed` and `transaction_verified`. The backend persists an audit record and prevents a txid from being associated with a different payment.

## Security expectations

- Pi Authentication is the only login method.
- User identity is verified server-side with Pi `/v2/me`.
- Server API key and wallet secrets never appear in frontend code.
- IOUs are visible only to their verified participants.
- Closed records cannot receive new shared notes.
- Partial payments do not reduce the confirmed balance until the creditor confirms them.
- A2U is not exposed as a fake/demo success path.

## Current Testnet-only surfaces

- `/test.html` is an owner-only lifecycle simulator for development validation.
- The optional 0.1 Pi support payment is a Testnet integration check, not a requirement to use the ledger.
- Mainnet will be a separate Pi app with separate credentials, wallet, deployment and network validation.

## Pre-Mainnet release check

Before freezing the Testnet release candidate, re-run:

- Pi login
- create/list persistence
- Activity Center details
- lifecycle actions
- settlement receipt
- partial settlement logic with two users when possible
- U2A payment approve/complete flow
- payment audit/idempotency
- Privacy and Terms links
- mobile layout in Pi Browser

## Group split review

1. Authenticate with Pi Testnet.
2. Create a split with at least two different Pi usernames and verify the displayed total.
3. Open each generated share and verify the common group summary.
4. Open a share link as its counterparty and confirm access; verify an unrelated account cannot read it.
5. Confirm that creating the split opens no wallet prompt and creates no Test-Pi transaction.
