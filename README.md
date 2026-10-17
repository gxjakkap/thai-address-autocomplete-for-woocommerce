# Thai Address Autocomplete for WooCommerce

When the country is Thailand, customers type part of a subdistrict, district, province or postcode, in Thai or English, and pick a suggestion:

```
บางมด » ทุ่งครุ » กรุงเทพมหานคร » 10140
```

The province, district (city), subdistrict and postcode are filled in.

- Works on block checkout, classic checkout and My Account → Addresses, with any theme.
- No external requests: the address data ships with the plugin.
- Other countries are unaffected.

## Requirements

WordPress 6.3+, PHP 7.4+, WooCommerce 8.3+ (tested up to 11.2.1).

## Install

1. Download the zip from the [latest release](https://github.com/gxjakkap/thai-address-autocomplete-for-woocommerce/releases/latest).
2. **Plugins → Add New → Upload Plugin**, choose the zip, activate.

Updates are manual: upload the new zip.

## Settings

**WooCommerce → Settings → General → Thai address autocomplete**

| Setting | Default | |
| --- | --- | --- |
| Enable | on | |
| Subdistrict field | Address line 2 | Or append to address line 1. |
| Display language | Automatic | Thai on Thai-locale sites, otherwise English. |
| Enable on | all | Checkout billing, checkout shipping, My Account. |

**WooCommerce → Status** shows the active mode, dataset version and any provinces that didn't match a WooCommerce state.

### WooCommerce's own address autocomplete

If **WooCommerce → Settings → General → Address autocomplete** (WooCommerce 9.9+) is on with this plugin as the preferred provider, WooCommerce's UI is used instead. In that mode:
- Address line 1 is the search box.
- At most 5 suggestions are shown.
- The subdistrict always goes to address line 2.

Leave that setting off to use the plugin's own UI.

## Hooks

| Filter | |
| --- | --- |
| `thai_address_autocomplete_dataset` | `( array $data )`: replace the dataset. |
| `thai_address_autocomplete_config` | `( array $config, string $context )`: front-end config. `$context` is `checkout`, `account`, `blocks` or `core`. |
| `thai_address_autocomplete_adapter` | `( string $adapter )`: force `'core'`, `'plugin'` or `'off'`. |

To use your own dataset (same format as `data/thai-address.json`):

```php
add_filter( 'thai_address_autocomplete_dataset', function () {
	return Thai_Address_Autocomplete_Dataset::from_file( WP_CONTENT_DIR . '/thai-address.json' );
} );
```

Then run `wp transient delete thai_address_autocomplete_meta`.

## Known limitations

- Picking a suggestion replaces address line 2 when that's the subdistrict field. Address line 1 is never replaced.
- Names are filled without the administrative prefix (`บางมด`, not `แขวงบางมด`).

## Development

```sh
composer install && vendor/bin/phpunit && vendor/bin/phpcs
npm install && npm run test:js
npm run zip        # dist/thai-address-autocomplete-for-woocommerce-<version>.zip
```

Browser tests (`tests/e2e`) run against `npx wp-env start` (latest versions) or `tests/env/min` (WordPress 6.3, WooCommerce 8.3). Implementation notes are in [docs/FINDINGS.md](docs/FINDINGS.md).

To rebuild the dataset from upstream: `node bin/build-dataset.mjs <thai-province-data>/data/raw`.

## License

GPL-2.0-or-later. Address data from [kongvut/thai-province-data](https://github.com/kongvut/thai-province-data), MIT (see `data/LICENSE-thai-province-data.txt`).
