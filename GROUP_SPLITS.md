# Group splits and private request links

IIOU can split one shared expense into 2–12 private bilateral shares. The creator enters a title, optional due date, and one `PiUsername amount` row per participant.

Each share is stored as a normal IIOU agreement with its own identifier, participant authorization, acceptance, reminders, partial-payment confirmations, settlement flow and closure flow. Shares carry common `split` metadata (`groupId`, title, total and participant count), but one participant cannot read another participant's agreement.

The returned total is informational and is calculated from the submitted shares. IIOU does not custody or route Test-Pi. Creating a split never initiates a Pi payment.

Agreement links use `/details.html?id=<agreement-id>`. Links contain no token or secret and do not bypass Pi authentication. The server returns the record only when the authenticated Pioneer is the creator or counterparty.

Testnet exposes `POST /api/splits` for product validation and records aggregate `split_created` metrics. Testnet records remain under the `iiou:` namespace and are never mixed with Mainnet.
