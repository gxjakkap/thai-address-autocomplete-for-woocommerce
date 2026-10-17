# Findings: WooCommerce address autocomplete provider framework

Investigated against **WooCommerce 11.2.1**, the latest stable on WordPress.org on 2026-10-17
(`https://downloads.wordpress.org/plugin/woocommerce.11.2.1.zip`). Paths are relative to the
`woocommerce/` plugin folder. Line numbers refer to 11.2.1. Block checkout bundles are minified, so
for those files the identifier is given instead of a line number.

## 1. Where `woocommerce_address_providers` is applied

| What | Where |
| --- | --- |
| Filter applied | `src/Internal/AddressProvider/AddressProviderController.php:67` inside `get_registered_providers()` |
| Docblock `@since` | `9.9.0` (same file, line 62). The base class header also says `@version 9.9.0` |
| Controller boot | `includes/class-woocommerce.php:403` gets `AddressProviderController` from the DI container. Its constructor hooks `init()` on `init` (default priority 10), see `AddressProviderController.php:30-42` |
| Base class | `includes/abstracts/abstract-wc-address-provider.php:17` `abstract class WC_Address_Provider` (autoloaded through the classmap) |
| Automattic helper | `src/Internal/AddressProvider/AbstractAutomatticAddressProvider.php` (`@since 10.1.0`). It is internal, handles JWTs for the hosted Google service, and third parties should not use it |

### Provider contract (PHP side)

`WC_Address_Provider` has **no methods**, only three public properties:

```php
public $id;                 // unique string, required
public $name;               // human label, required (shown in WC settings when >1 provider)
public $branding_html = ''; // optional "powered by" HTML, wp_kses'd before output
```

The filter callback returns an array of class-name strings (instantiated with `new $class()`) or
`WC_Address_Provider` instances (`AddressProviderController.php:89-140`). Providers with an empty
`id` or `name`, a duplicate `id`, or the wrong type are dropped and logged.

The PHP class only **declares** the provider. All searching happens in JavaScript.

### Enabling

* Global on/off: option `woocommerce_address_autocomplete_enabled` (default `no`), shown in
  **WooCommerce → Settings → General → "Address autocomplete"**
  (`includes/admin/settings/class-wc-settings-general.php:87-100`). The checkbox is disabled until at
  least one provider is registered.
* Preferred provider: option `woocommerce_address_autocomplete_provider`, a select shown only when
  more than one provider is registered (`class-wc-settings-general.php:102-115`). The controller
  moves the preferred provider to the front of the list (`AddressProviderController.php:142-153`),
  and `get_preferred_provider()` (`:182`) falls back to the first registered provider.
* No feature flag beyond that option. The settings code is wrapped in `try` and hides the setting if
  the container cannot provide the controller (`class-wc-settings-general.php:76-121`).

## 2. How checkouts call providers

Both checkouts use a **client-side JS registry**. There is no REST or Store API endpoint for
address search in core. The provider's own JS decides where data comes from.

### Shared registry (classic and blocks)

`assets/js/frontend/utils/address-autocomplete-common.js` (script handle
`wc-address-autocomplete-common`):

* Creates `window.wc.addressAutocomplete = { providers, activeProvider: {billing, shipping}, serverProviders }` (lines 8-13).
* `serverProviders` is parsed from `wc_address_autocomplete_common_params.address_providers`, a JSON
  string of `{id, name, branding_html}` in preference order (lines 17-44, localized in
  `includes/class-wc-frontend-scripts.php:685-700`).
* `registerAddressAutocompleteProvider( provider )` (lines 51-139) requires:
  * `provider.id` (string) that **matches a server-registered provider**
  * `canSearch( country ) → boolean`
  * `search( query, country, type ) → Promise<Suggestion[]>`
  * `select( suggestionId, country ) → Promise<AddressData>`
  
  It freezes the object, stores it and, when `wc.wcBlocksData.checkoutStore` exists, dispatches
  `addAddressAutocompleteProvider( id )` so the block checkout re-evaluates.

Shapes:

```ts
type Suggestion  = { id: string; label: string; matchedSubstrings?: { offset: number; length: number }[] };
type AddressData = Partial<{ country; address_1; address_2; city; state; postcode }>;
```

### Script loading

`includes/class-wc-frontend-scripts.php`:

* Registered only if `woocommerce_address_autocomplete_enabled` is `yes` (lines 393-405).
* Enqueued on **every front-end page** when the option is on and at least one provider is
  registered (lines 507-518). So a provider's script can depend on `wc-address-autocomplete-common`
  and enqueue itself when that handle is enqueued.

### Classic checkout and My Account (`assets/js/frontend/address-autocomplete.js`)

* Runs on `DOMContentLoaded` (line 89) against fixed IDs `${type}_address_1`, `_address_2`,
  `_city`, `_country`, `_postcode`, `_state`. Because these IDs are generic, the edit-address forms in
  My Account work too.
* Active provider per address type: the first provider, in server preference order, whose
  `canSearch( country )` returns true (`setActiveProvider`, lines 26-80). It is re-evaluated on
  country change.
* **The search input is always `address_1`.** Search starts at 3 characters (line 441), and at most
  **5** suggestions are shown (line 469).
* `selectAddress()` (line 703): sets `country`, then `address_1` only if provided (line 739). After a
  timeout it sets `address_2`, `city` and `postcode`, **clearing each one the provider leaves out**
  (lines 768, 780, 792). Then it sets `state` (line 798).

### Block checkout (minified, `assets/client/blocks/checkout.js` and `wc-cart-checkout-base-frontend.js`)

* Provider list comes from the block settings key `addressAutocompleteProviders`
  (`src/Blocks/BlockTypes/Checkout.php:420-435`). On block checkout WC dequeues the classic
  `wc-address-autocomplete` script but keeps the common registry (`Checkout.php:82-85`).
* A hook picks the active provider per address type, again the first in order whose `canSearch(country)`
  is true, and stores it with `setActiveAddressAutocompleteProvider` in `wc/store/checkout`.
* The `address_1` field becomes an ARIA combobox. `search( query, country )` runs from 3 characters.
  On select it calls `select( id, country )` and passes the result to
  `wc/store/cart` `setShippingAddress` / `setBillingAddress` (and mirrors it to the other address
  when "use same address" is on).
* `SET_SHIPPING_ADDRESS` / `SET_BILLING_ADDRESS` **merge** a partial object into the cart address
  (`wc-blocks-data.js` reducer). So on blocks, keys left out are kept, which differs from classic.

## 3. Fit for Thai subdistrict lookup

The framework is designed for "type a street, pick a full address". For Thai lookup it falls short in
four ways:

1. **The search box is `address_1`.** Thai customers type house number, soi and road there, not
   the subdistrict. The query text stays in `address_1` after a pick. Overwriting it would break the
   "never overwrite customer text in `address_1`" rule.
2. **Opt-in is global and off by default.** It needs `woocommerce_address_autocomplete_enabled = yes`,
   and that switch also turns on every other provider (e.g. WooPayments/Google).
3. **One provider per country.** If another provider is preferred and `canSearch('TH')`, ours never
   runs.
4. **At most 5 suggestions** (classic). This plugin returns up to 10.

### Decision

* **Core provider adapter**: always register `thai_address_autocomplete` through
  `woocommerce_address_providers` when `WC_Address_Provider` exists, so merchants can choose it. It
  becomes the **active** adapter only when the WC option is on **and** our provider is the preferred
  one (`get_preferred_provider()`). In that mode the JS provider answers only for `TH`, never returns
  `address_1`, and always writes the subdistrict to `address_2` (the append-to-`address_1` mode
  cannot work when `address_1` is the search box).
* **Otherwise (the default after activation) the plugin's own adapters run:**
  * Block checkout: forced inner blocks registered with `registerCheckoutBlock` from
    `@woocommerce/blocks-checkout` under `woocommerce/checkout-shipping-address-block` and
    `woocommerce/checkout-billing-address-block`, writing through `wc/store/cart`
    `setShippingAddress` / `setBillingAddress`. No DOM changes to WC-rendered fields.
    Verified in `wc-cart-checkout-base-frontend.js`: `registerCheckoutBlock` accepts `force: true`
    (or `metadata.attributes.lock.default.remove`), and the frontend renderer adds registered forced
    blocks that are missing from the saved page markup. So it works **without re-saving the
    checkout page**. Valid parent areas are the `innerBlockAreas` enum, which includes both address
    blocks.
  * Classic checkout and My Account: vanilla JS combobox on the standard field IDs, re-evaluated
    on `country_to_state_changed`.

## 4. Other facts used

* `FeaturesUtil::declare_compatibility( $feature_id, $plugin_file, $compatible )`:
  `src/Utilities/FeaturesUtil.php:87`. Feature IDs `custom_order_tables` and `cart_checkout_blocks`
  (`src/Internal/Features/FeaturesController.php:339`).
* Thailand states: `i18n/states.php:1715`, 77 entries keyed by ISO 3166-2 codes (`TH-10` … `TH-96`).
  The plugin reads them at runtime through `WC()->countries->get_states( 'TH' )` and does not
  hardcode them.
* Dataset (kongvut/thai-province-data, MIT): province IDs are sequential (1-77), but district IDs are
  TIS-1099 codes whose first two digits equal the ISO 3166-2:TH numeric suffix (e.g. district `1001`
  → `TH-10`). `bin/build-dataset.mjs` derives the province code this way and fails if a province's
  districts disagree.
