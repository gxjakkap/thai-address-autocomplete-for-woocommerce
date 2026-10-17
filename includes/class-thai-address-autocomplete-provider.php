<?php
/**
 * Provider for WooCommerce's address autocomplete framework (WooCommerce 9.9+).
 *
 * The PHP class only declares the provider. Searching happens in assets/js/provider.js.
 *
 * @package Thai_Address_Autocomplete
 */

defined( 'ABSPATH' ) || exit;

/**
 * Thai address provider.
 */
class Thai_Address_Autocomplete_Provider extends WC_Address_Provider {

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->id   = Thai_Address_Autocomplete::PROVIDER_ID;
		$this->name = __( 'Thai Address Autocomplete (Thailand only, works offline)', 'thai-address-autocomplete-for-woocommerce' );
	}
}
