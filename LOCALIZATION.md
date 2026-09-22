# English and Simplified Chinese interface

The Testnet dashboard and Activity Center support English and Simplified Chinese (`zh-CN`). The language control is injected by `i18n.js`, persists the preference in local storage under `iiou-language`, and never changes agreement data, usernames, amounts, Testnet configuration or API payloads.

English is the default. Selecting `简体中文` reloads the current page and translates static controls, forms, lifecycle labels, common due-date messages and dynamically rendered activity content. The dictionary mirrors Mainnet, while Testnet keeps `sandbox:true`, its own repository, deployment and `iiou:` storage namespace.

User-entered notes are never translated or sent to a translation provider. The canonical policy text remains the English version committed in the repository.
