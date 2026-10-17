<?php
/**
 * PHPUnit bootstrap for the pure-PHP core (no WordPress needed).
 *
 * @package Thai_Address_Autocomplete
 */

define( 'THAI_ADDRESS_AUTOCOMPLETE_TESTS', true );
require dirname( __DIR__, 2 ) . '/vendor/autoload.php';
require dirname( __DIR__, 2 ) . '/includes/class-thai-address-autocomplete-dataset.php';
