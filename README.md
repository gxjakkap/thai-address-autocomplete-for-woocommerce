# Thai Address Autocomplete for WooCommerce

Thai address autocomplete for WooCommerce. When the country is Thailand, a customer can type part of a
subdistrict, district, province or postcode, in Thai or English, and pick a suggestion:

```
บางมด » ทุ่งครุ » กรุงเทพมหานคร » 10140
```

Picking one fills in the province, district (city), subdistrict and postcode.

- Works with **block checkout**, **classic checkout** (`[woocommerce_checkout]`) and **My Account → Addresses**. The plugin detects at runtime which form is on the page.
- Works with any theme, block or classic. It adds no theme-specific CSS or selectors.
- Only active when the country is **TH**. Other countries are unaffected.
- **No external requests.** The dataset ships with the plugin and is served from your own site. What customers type stays in their browser.
- Thai and English UI. Dataset names follow the site language, and you can override that in settings.

## Requirements

| | Minimum | Why |
| --- | --- | --- |
| WordPress | 6.3 | `wp_register_script()` with the `$args` array (`in_footer`). WooCommerce 8.3 also requires 6.3. |
| PHP | 7.4 | WooCommerce 8.3's minimum. The code avoids PHP 8-only syntax, and PHPCompatibility checks this. |
| WooCommerce | 8.3 | The oldest version in the test matrix. Block checkout became the default in 8.3. The plugin needs `registerCheckoutBlock` with forced inner blocks, `wc/store/cart` `setShippingAddress`/`setBillingAddress`, and `FeaturesUtil::declare_compatibility`. |
| Tested up to | WooCommerce 11.2.1 | |

The WooCommerce address autocomplete framework (9.9+) is **optional**. On older versions the plugin uses its own adapters.

If WooCommerce is missing or older than 8.3, the plugin stays inactive and shows an admin notice. It never causes a fatal error.
It is compatible with HPOS and with Cart/Checkout blocks, and works on multisite with per-site activation.

## Install

1. Download `thai-address-autocomplete-for-woocommerce-<version>.zip` from the [latest release](https://github.com/gxjakkap/thai-address-autocomplete-for-woocommerce/releases/latest).
2. Go to **Plugins → Add New → Upload Plugin**, choose the zip and activate it.

It works right away with the defaults. The zip needs no Node or Composer.

Updates are manual: upload the new zip. The header sets `Update URI: false`, so WordPress never replaces this plugin with a plugin of the same slug from WordPress.org.

## Settings

**WooCommerce → Settings → General → Thai address autocomplete**

| Setting | Default | |
| --- | --- | --- |
| Enable | on | |
| Subdistrict field | Address line 2 | Or *Append to address line 1*. Text the customer already typed in address line 1 is kept, and the subdistrict is added after it. If a site removed address line 2, the plugin appends to line 1 instead. |
| Display language | Automatic | Thai when the locale starts with `th` (`determine_locale()`, which multilingual plugins respect), otherwise English. Can be forced to Thai or English. |
| Enable on | all | Checkout billing, checkout shipping, My Account addresses. |

The active adapter appears at the top of this section and in **WooCommerce → Status → System Status → Thai Address Autocomplete**. The System Status section also shows the dataset version and counts, and any provinces that did not match a WooCommerce state.

## How it works

Details, with WooCommerce source references, are in [docs/FINDINGS.md](docs/FINDINGS.md).

The plugin picks one adapter per request:

1. **Core provider adapter.** WooCommerce 9.9+ has an address autocomplete framework (`woocommerce_address_providers`). This plugin always registers a provider there (*Thai Address Autocomplete*). It becomes the active adapter when **WooCommerce → Settings → General → Address autocomplete** is on and this provider is the preferred one. If it is the only provider, it is preferred automatically. WooCommerce then draws the UI and uses **address line 1 as the search box**, so the query text stays in address line 1 after a pick and the subdistrict always goes to address line 2. WooCommerce shows at most 5 suggestions in this mode.
2. **Plugin adapters** (the default, used whenever the above does not apply):
   - **Block checkout**: a "Find subdistrict, district, province or postcode" field inside the shipping and billing address blocks. It is a forced checkout inner block registered with `registerCheckoutBlock`, so WooCommerce shows it without the checkout page being edited. Picks are written to the `wc/store/cart` data store. WooCommerce-rendered fields are never modified in the DOM.
   - **Classic checkout and My Account**: suggestions on `{billing|shipping}_postcode`, `_city` and `_address_2` (when that is the subdistrict field). Re-evaluated on `country_to_state_changed`. `address_1` is never used as a search box.

Which fields get filled comes from the **live field config**: `WC()->checkout()->get_checkout_fields()` on classic checkout, and `WC()->countries->get_address_fields( 'TH', … )` elsewhere. Fields that a site removed or hid are skipped. The plugin never reorders, relabels or changes the required flag of any field.

The **province** is filled with WooCommerce's own Thailand state code, read at runtime from `WC()->countries->get_states( 'TH' )`. Dataset provinces are matched by ISO 3166-2 code (`TH-10` …), with a fallback to the English or Thai name. If any province cannot be matched, the plugin shows an admin warning.

### Performance and caching

- Scripts load only where an address form renders. Classic forms are detected by their own template hooks. Block checkout uses the Blocks integration registry. In core mode, scripts load only on checkout and account pages.
- The dataset (about 425 KB of JSON, about 100 KB gzipped) is fetched once, on first focus of an autocomplete field, from `/wp-json/thai-address-autocomplete/v1/dataset?v=<hash>`. The response is `Cache-Control: public, max-age=31536000, immutable` with an `ETag`, so browsers and CDNs cache it. A new hash means a new URL.
- The endpoint is public and read-only. It takes no input and returns the same data to everyone, so it has no nonce. The dataset hash and the province mapping are cached in the `thai_address_autocomplete_meta` transient for one day. It is rebuilt when the plugin or WooCommerce version changes.
- Search runs in the browser and takes about 0.5 ms per keystroke across 7,436 subdistricts.

### Search and ranking

- Thai and English, case-insensitive, partial input, multiple words (`bang mot`, `ทุ่งครุ 10140`).
- Administrative prefixes are ignored (`ต.`, `ตำบล`, `แขวง`, `อ.`, `อำเภอ`, `เขต`, `จ.`, `จังหวัด`, `Tambon`, `Khwaeng`, `Amphoe`, `Khet`, `Changwat`).
- Ranking, highest first: whole query as one name (`chiang mai`) > exact postcode > exact name > prefix (name or postcode) > substring. Within the same match type, a subdistrict match ranks above a district match, which ranks above a province match.
- At most 10 results. Every suggestion shows the full chain, because names and postcodes repeat across areas.

### Accessibility

The suggestion list follows the WAI-ARIA 1.2 combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, and `role="listbox"`/`option`.

- ↑/↓ move through suggestions, Enter selects, Escape closes, Tab leaves.
- A polite live region announces how many suggestions there are, "no match", and "address filled in".
- Enter submits the form as usual unless a suggestion is highlighted.

## Hooks

| Hook | Type | |
| --- | --- | --- |
| `thai_address_autocomplete_dataset` | filter | `( array $data )`: replace or modify the dataset. Invalid data is logged (WooCommerce logs, source `thai-address-autocomplete`) and the bundled data is used instead. |
| `thai_address_autocomplete_config` | filter | `( array $config, string $context )`: front-end config. `$context` is `checkout`, `account`, `blocks` or `core`. |
| `thai_address_autocomplete_adapter` | filter | `( string $adapter )`: force `'core'`, `'plugin'` or `'off'`. |

### Replacing the dataset

```php
add_filter( 'thai_address_autocomplete_dataset', function ( $data ) {
	return Thai_Address_Autocomplete_Dataset::from_file( WP_CONTENT_DIR . '/thai-address.json' );
} );
```

Then delete the cache: `wp transient delete thai_address_autocomplete_meta`. Otherwise the change is picked up within a day.

Format (same as `data/thai-address.json`):

```json
{
  "version": "my-data-2026-10-01",
  "provinces":    [ [ "10", "กรุงเทพมหานคร", "Bangkok" ] ],
  "districts":    [ [ 0, "ทุ่งครุ", "Thung Khru" ] ],
  "subdistricts": [ [ 0, "บางมด", "Bang Mot", "10140" ] ]
}
```

- `provinces[i]`: ISO 3166-2:TH code (`"10"` or `"TH-10"`), Thai name, English name.
- `districts[i]`: index into `provinces`, Thai name, English name.
- `subdistricts[i]`: index into `districts`, Thai name, English name, 5-digit postcode.

To rebuild from a newer upstream release:

```sh
git clone https://github.com/kongvut/thai-province-data /tmp/tpd
node bin/build-dataset.mjs /tmp/tpd/data/raw
```

## Data source and license

- Address data: [kongvut/thai-province-data](https://github.com/kongvut/thai-province-data) © Kongvut Sangkla, **MIT License**, which is GPL-compatible. Bundled snapshot: `kongvut-2026-09-29`, with 77 provinces, 930 districts and 7,436 subdistricts. Thai and English names come from that project. Province codes come from its TIS-1099 district IDs. Its license notice ships as `data/LICENSE-thai-province-data.txt`.
  - Also considered: `earthchie/jquery.Thailand.js` (WTFPL, also GPL-compatible). It has Thai names only and was last updated in 2024.
- Plugin: **GPL-2.0-or-later** (see `LICENSE`).

## Known limitations

- **Core-framework mode** inherits WooCommerce's UI:
  - The search box is address line 1, so the query text stays there.
  - At most 5 suggestions are shown.
  - The subdistrict always goes to address line 2.
  - The "Enable on" form settings do not apply.
  
  The plugin adapters avoid all of this. To keep using them, leave WooCommerce's own *Address autocomplete* setting off, or choose another preferred provider there.
- On block checkout the lookup field appears **below** the address fields of each address block. WooCommerce adds forced inner blocks after the saved ones, and the plugin does not move WooCommerce's fields.
- If the customer typed into address line 2 and then picked a suggestion, address line 2 is replaced by the subdistrict (when that is the configured subdistrict field). Address line 1 is never replaced.
- Names are filled without the administrative prefix (`บางมด`, not `แขวงบางมด`).
- No automatic updates. See *Install*.

## Development

There is no build step: the JavaScript is plain ES5 that the browser runs directly. Composer and npm are only for development tools.

```sh
composer install                       # PHPUnit, WPCS, PHPCompatibility
vendor/bin/phpunit                     # PHP unit tests
vendor/bin/phpcs                       # coding standards
npm install
npm run test:js                        # search, ranking and field-mapping tests (node:test)
npm run zip                            # dist/thai-address-autocomplete-for-woocommerce-<version>.zip
```

Without local PHP:

```sh
docker run --rm -v "$PWD":/app -w /app php:8.3-cli vendor/bin/phpunit
```

### Test coverage

- **PHP** (`tests/php`): dataset loading and validation, mapping of all 77 provinces to WooCommerce states (fixture from WooCommerce 11.2.1 `i18n/states.php`), name fallback and unresolved reporting, and field mapping, including removed and hidden fields.
- **JS** (`tests/js`): ranking (exact > prefix > substring, phrase matches, postcode), Thai, English and prefix handling, the 10-result limit, labels and highlighting, and field mapping, including appending to `address_1` without loss.
- **Browser** (`tests/e2e`, Playwright against wp-env):
  - `smoke.mjs`: block checkout (fill, postcode search, persistence after reload, country switch), classic checkout, My Account. Set `WIDTH=375` for mobile.
  - `core-provider.mjs`: the core framework adapter.
  - `admin.mjs`: the settings page and System Status section.

### wp-env matrix

| Environment | WordPress | WooCommerce | PHP | Themes |
| --- | --- | --- | --- | --- |
| `.wp-env.json` (latest) | latest | latest | 8.3 | Twenty Twenty-Five (bundled, block theme), Storefront (classic) |
| `tests/env/min/.wp-env.json` | 6.3 | 8.3.0 | 8.1 | Twenty Twenty-Three (bundled, block theme), Storefront 4.5.4 (classic) |

The minimum environment runs PHP 8.1 because the PHP 7.4 Docker images are built on Debian 11, whose security archive no longer serves the packages wp-env installs. PHP 7.4 is covered by PHPUnit (`docker run --rm -v "$PWD":/app -w /app php:7.4-cli vendor/bin/phpunit`) and PHPCompatibility.

```sh
npx wp-env start                               # latest, http://localhost:8890 (admin / password)
(cd tests/env/min && npx wp-env start)         # minimum, http://localhost:8892

# Seed a store (repeat with `--config`/cwd for the min env):
npx wp-env run cli wp option update woocommerce_default_country TH:TH-10
npx wp-env run cli wp option update woocommerce_coming_soon no
npx wp-env run cli wp wc product create --name="Test Shirt" --regular_price=250 --user=admin
npx wp-env run cli wp wc shipping_zone_method create 0 --method_id=flat_rate --enabled=true --user=admin
npx wp-env run cli wp post create --post_type=page --post_title="Classic Checkout" --post_status=publish --post_content='[woocommerce_checkout]'
npx wp-env run cli wp user create customer customer@example.test --role=customer --user_pass=customer-test-pass

npx playwright install chromium
BASE=http://localhost:8890 PRODUCT=<id> CLASSIC_PAGE=<id> BLOCK_PAGE=<checkout page id> ACCOUNT_PAGE=<id> node tests/e2e/smoke.mjs
npx wp-env run cli wp theme activate storefront   # then run again with the classic theme
```

### Manual test checklist

- [ ] Block checkout: shipping address, then pick a suggestion. Province, city, address line 2 and postcode fill in. Address line 1 is unchanged.
- [ ] Block checkout: untick "Use same address for billing". The billing lookup works on its own.
- [ ] Classic checkout: billing and "Ship to a different address": suggestions appear on postcode, city and address line 2.
- [ ] My Account → Addresses → Billing and Shipping.
- [ ] Bangkok (`บางมด` → แขวง/เขต) and a non-Bangkok province (`ช้างคลาน` → เมืองเชียงใหม่, เชียงใหม่).
- [ ] Postcode-only (`10140`, prefix `501`) and English (`bang mot`, `chiang mai`) search.
- [ ] Switch country to another country (no suggestions, ARIA attributes removed), then back to Thailand (works again).
- [ ] Multi-country store (selling to TH and others): other countries behave exactly as before.
- [ ] Site language Thai and English. Also force Thai or English in settings.
- [ ] *Append to address line 1*: existing text is kept, and re-picking does not duplicate.
- [ ] Mobile width (375 px): the list fits the field width and wraps.
- [ ] Keyboard only: Tab to the field, type, use ↑/↓ and Enter, then Escape. A screen reader announces the result count.
- [ ] Block theme (Twenty Twenty-Five) and classic theme (Storefront).
- [ ] WooCommerce → Settings → General → *Address autocomplete* on: System Status shows "core framework" and suggestions appear on address line 1.
- [ ] Deactivate WooCommerce: an admin notice appears and there is no fatal error.
- [ ] Uninstall: `wp option list --search='thai_address_autocomplete_*'` is empty.
