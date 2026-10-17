<?php
/**
 * Block checkout integration: loads the lookup inner blocks and passes config through wcSettings.
 *
 * @package Thai_Address_Autocomplete
 */

defined( 'ABSPATH' ) || exit;

use Automattic\WooCommerce\Blocks\Integrations\IntegrationInterface;

/**
 * Checkout block integration.
 */
class Thai_Address_Autocomplete_Blocks implements IntegrationInterface {

	/**
	 * Integration name. Script data is exposed as wcSettings "thai-address-autocomplete_data".
	 *
	 * @return string
	 */
	public function get_name() {
		return 'thai-address-autocomplete';
	}

	/**
	 * Register scripts.
	 */
	public function initialize() {
		Thai_Address_Autocomplete::register_assets();
		wp_register_script(
			'thai-address-autocomplete-blocks',
			plugins_url( 'assets/js/blocks.js', THAI_ADDRESS_AUTOCOMPLETE_FILE ),
			array( 'thai-address-autocomplete-combobox', 'wc-blocks-checkout', 'wc-settings', 'wp-data', 'wp-element' ),
			THAI_ADDRESS_AUTOCOMPLETE_VERSION,
			array( 'in_footer' => true )
		);
		wp_enqueue_style( 'thai-address-autocomplete' );
	}

	/**
	 * Front-end script handles.
	 *
	 * @return string[]
	 */
	public function get_script_handles() {
		return array( 'thai-address-autocomplete-blocks' );
	}

	/**
	 * No editor scripts: the lookup is a forced block that the front end renders by itself.
	 *
	 * @return string[]
	 */
	public function get_editor_script_handles() {
		return array();
	}

	/**
	 * Config, only computed when the checkout block renders.
	 *
	 * @return array
	 */
	public function get_script_data() {
		return Thai_Address_Autocomplete::config( 'blocks' );
	}
}
