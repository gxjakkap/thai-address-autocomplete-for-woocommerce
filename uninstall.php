<?php
/**
 * Remove plugin options and cache on uninstall.
 *
 * @package Thai_Address_Autocomplete
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Delete this site's plugin data.
 */
function thai_address_autocomplete_uninstall_site() {
	foreach ( array( 'enabled', 'placement', 'language', 'checkout_billing', 'checkout_shipping', 'my_account' ) as $thai_address_autocomplete_key ) {
		delete_option( 'thai_address_autocomplete_' . $thai_address_autocomplete_key );
	}
	delete_transient( 'thai_address_autocomplete_meta' );
}

if ( is_multisite() ) {
	foreach ( get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	) as $thai_address_autocomplete_site ) {
		switch_to_blog( $thai_address_autocomplete_site );
		thai_address_autocomplete_uninstall_site();
		restore_current_blog();
	}
} else {
	thai_address_autocomplete_uninstall_site();
}
