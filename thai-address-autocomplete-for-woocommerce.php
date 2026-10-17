<?php
/**
 * Plugin Name:          Thai Address Autocomplete for WooCommerce
 * Plugin URI:           https://github.com/gxjakkap/thai-address-autocomplete-for-woocommerce
 * Description:          Suggests Thai subdistrict, district, province and postcode as customers type, and fills the address fields. Works with block and classic checkout and My Account. Data ships with the plugin; nothing is sent to third parties.
 * Version:              1.0.0
 * Requires at least:    6.3
 * Requires PHP:         7.4
 * Requires Plugins:     woocommerce
 * Update URI:           false
 * Author:               Jakkaphat Chalermphanaphan
 * Author URI:           https://github.com/gxjakkap
 * License:              GPL-2.0-or-later
 * License URI:          https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:          thai-address-autocomplete-for-woocommerce
 * Domain Path:          /languages
 * WC requires at least: 8.3
 * WC tested up to:      11.2
 *
 * @package Thai_Address_Autocomplete
 */

defined( 'ABSPATH' ) || exit;

define( 'THAI_ADDRESS_AUTOCOMPLETE_VERSION', '1.0.0' );
define( 'THAI_ADDRESS_AUTOCOMPLETE_FILE', __FILE__ );
define( 'THAI_ADDRESS_AUTOCOMPLETE_DIR', plugin_dir_path( __FILE__ ) );
define( 'THAI_ADDRESS_AUTOCOMPLETE_MIN_WC', '8.3' );

require_once THAI_ADDRESS_AUTOCOMPLETE_DIR . 'includes/class-thai-address-autocomplete-dataset.php';
require_once THAI_ADDRESS_AUTOCOMPLETE_DIR . 'includes/class-thai-address-autocomplete.php';

add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

add_action(
	'plugins_loaded',
	static function () {
		if ( defined( 'WC_VERSION' ) && version_compare( WC_VERSION, THAI_ADDRESS_AUTOCOMPLETE_MIN_WC, '>=' ) && function_exists( 'WC' ) ) {
			Thai_Address_Autocomplete::boot();
			return;
		}
		add_action(
			'admin_notices',
			static function () {
				if ( ! current_user_can( 'activate_plugins' ) ) {
					return;
				}
				$message = defined( 'WC_VERSION' )
					/* translators: 1: required WooCommerce version, 2: installed WooCommerce version. */
					? sprintf( __( 'Thai Address Autocomplete for WooCommerce needs WooCommerce %1$s or newer (installed: %2$s). The plugin is inactive until WooCommerce is updated.', 'thai-address-autocomplete-for-woocommerce' ), THAI_ADDRESS_AUTOCOMPLETE_MIN_WC, WC_VERSION )
					: __( 'Thai Address Autocomplete for WooCommerce needs WooCommerce to be installed and active.', 'thai-address-autocomplete-for-woocommerce' );
				echo '<div class="notice notice-error"><p>' . esc_html( $message ) . '</p></div>';
			}
		);
	}
);
