# IIOU — Personal IOUs for Pioneers

IIOU is a Pi Testnet application for creating, confirming, tracking, and settling personal IOU records between Pioneers.

## Product model

IIOU is intentionally **non-custodial** in its core ledger flow. It does not lend Pi, hold user funds, route repayment funds between users, or arbitrate disputes. Participants create a shared record, the other participant accepts or declines it, the debtor can mark it paid, and the creditor confirms settlement.

Current lifecycle:

`proposed → accepted → payment_claimed → settled`

Alternative terminal states are `declined` and `cancelled`.

## Pi integration

- Pi SDK v2, Testnet sandbox mode
- Pi Authentication only
- Access tokens are verified server-side with `GET /v2/me`
- Optional 0.1 Pi Testnet support payment uses the standard U2A approve/complete handshake
- Payment ownership, direction, network, amount, memo, and metadata are verified server-side before approval/completion
- Incomplete Pi payments are recovered after authentication when possible
- A2U is deliberately disabled while the Testnet app wallet is being rotated

## Storage

IIOU uses a Redis-compatible REST store (Upstash / Vercel Marketplace integration). Configure either naming convention:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

or

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

## Required environment variables

- `PI_API_KEY` — Pi Developer Portal server API key for this Testnet app
- Redis REST variables shown above

`PI_APP_WALLET_SEED` is **not required by the current non-custodial ledger or U2A flow**. Do not expose wallet seeds to the frontend or commit them to Git.

## Architecture

- `index.html` — responsive Pi Browser frontend
- `api/auth.js` — verified Pi sign-in
- `api/ious.js` — create/list IOUs
- `api/iou-action.js` — controlled IOU state transitions
- `api/pi-payment.js` — hardened Testnet U2A support payment
- `api/a2u.js` — explicitly disabled until wallet rotation is complete
- `lib/pi.js` — Pi Platform API helpers
- `lib/store.js` — persistent Redis REST storage
- `privacy.html`, `terms.html` — app policies

## Security notes

The browser-supplied Pi user object is presentation-only. The backend uses the access token and Pi `/me` response as the identity source of truth. Mutating routes verify authentication and authorization before changing records. No email/password login, third-party login, fiat payment, or non-Pi token flow is present.

## Network

This repository is for the **IIOU Testnet app**. A separate Pi Mainnet application and deployment should be created only after Testnet product, wallet, storage, and payment testing are complete.
