# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-17

### Added
- Thai address suggestions (subdistrict » district » province » postcode). Selecting one fills the province (WooCommerce state code), city, postcode and subdistrict.
- Block checkout adapter: a lookup field that WooCommerce renders inside the shipping and billing address blocks, added through `registerCheckoutBlock`. Writes go through the `wc/store/cart` data store.
- Classic checkout and My Account → Addresses adapter: suggestions on the postcode, city and subdistrict fields.
- Provider for WooCommerce's address autocomplete framework (`woocommerce_address_providers`, WooCommerce 9.9+). Used when WooCommerce's own address autocomplete is on and this provider is the preferred one.
- Settings under WooCommerce → Settings → General → Thai address autocomplete: enable, where the subdistrict goes, display language, which forms.
- WooCommerce → Status section showing the active adapter, dataset and province mapping.
- Bundled dataset from kongvut/thai-province-data (MIT), 77 provinces / 930 districts / 7,436 subdistricts, replaceable through the `thai_address_autocomplete_dataset` filter.
- Thai translation.
- Declares compatibility with HPOS and Cart/Checkout blocks.
