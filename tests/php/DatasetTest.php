<?php
/**
 * Tests for Thai_Address_Autocomplete_Dataset.
 *
 * @package Thai_Address_Autocomplete
 */

use PHPUnit\Framework\TestCase;

/**
 * Dataset loading, province → WooCommerce state mapping and field mapping.
 */
class DatasetTest extends TestCase {

	/**
	 * Bundled dataset.
	 *
	 * @var array
	 */
	private static $data;

	/**
	 * WooCommerce TH states (fixture from WooCommerce's i18n/states.php).
	 *
	 * @var array
	 */
	private static $states;

	public static function setUpBeforeClass(): void {
		self::$data   = Thai_Address_Autocomplete_Dataset::from_file( dirname( __DIR__, 2 ) . '/data/thai-address.json' );
		self::$states = require __DIR__ . '/fixtures/wc-states-th.php';
	}

	public function test_bundled_dataset_loads_and_is_valid() {
		$this->assertSame( array(), Thai_Address_Autocomplete_Dataset::validate( self::$data ) );
		$this->assertCount( 77, self::$data['provinces'] );
		$this->assertGreaterThan( 900, count( self::$data['districts'] ) );
		$this->assertGreaterThan( 7000, count( self::$data['subdistricts'] ) );
		$this->assertMatchesRegularExpression( '/^kongvut-\d{4}-\d{2}-\d{2}$/', self::$data['version'] );
	}

	public function test_missing_or_broken_file_returns_empty_array() {
		$this->assertSame( array(), Thai_Address_Autocomplete_Dataset::from_file( '/nonexistent.json' ) );
		$tmp = tempnam( sys_get_temp_dir(), 'tac' );
		file_put_contents( $tmp, '{not json' );
		$this->assertSame( array(), Thai_Address_Autocomplete_Dataset::from_file( $tmp ) );
		unlink( $tmp );
	}

	public function test_validate_rejects_bad_data() {
		$this->assertNotEmpty( Thai_Address_Autocomplete_Dataset::validate( 'x' ) );
		$this->assertNotEmpty( Thai_Address_Autocomplete_Dataset::validate( array( 'provinces' => array() ) ) );

		$bad                     = self::$data;
		$bad['subdistricts'][0][3] = '1020';
		$this->assertSame( array( 'Invalid subdistricts row 0.' ), Thai_Address_Autocomplete_Dataset::validate( $bad ) );

		$bad                  = self::$data;
		$bad['districts'][0][0] = 999;
		$this->assertSame( array( 'Invalid districts row 0.' ), Thai_Address_Autocomplete_Dataset::validate( $bad ) );
	}

	public function test_all_77_provinces_resolve_to_woocommerce_states() {
		$this->assertCount( 77, self::$states );
		$mapped = Thai_Address_Autocomplete_Dataset::map_states( self::$data['provinces'], self::$states );
		$this->assertNotContains( '', $mapped, 'Every province maps to a WooCommerce state' );
		$this->assertCount( 77, array_unique( $mapped ), 'Mapping is one-to-one' );
		$this->assertEqualsCanonicalizing( array_keys( self::$states ), $mapped );
	}

	public function test_known_province_codes() {
		$mapped = Thai_Address_Autocomplete_Dataset::map_states( self::$data['provinces'], self::$states );
		$by_en  = array();
		foreach ( self::$data['provinces'] as $i => $p ) {
			$by_en[ $p[2] ] = $mapped[ $i ];
		}
		$this->assertSame( 'TH-10', $by_en['Bangkok'] );
		$this->assertSame( 'TH-50', $by_en['Chiang Mai'] );
		$this->assertSame( 'TH-38', $by_en['Bueng Kan'] );
		$this->assertSame( 'TH-96', $by_en['Narathiwat'] );
	}

	public function test_mapping_falls_back_to_names_and_reports_unresolved() {
		$provinces = array(
			array( 'TH-10', 'กรุงเทพมหานคร', 'Bangkok' ), // Already prefixed.
			array( 'XX', 'เชียงใหม่', 'Chiang Mai' ),     // Unknown code, English name matches.
			array( 'YY', 'กระบี่', 'Nowhere' ),           // Thai name matches a translated label.
			array( 'ZZ', 'ไม่มี', 'Atlantis' ),           // Unresolvable.
		);
		$states    = array(
			'TH-10' => 'Bangkok',
			'TH-50' => 'Chiang Mai',
			'TH-81' => 'กระบี่',
		);
		$this->assertSame( array( 'TH-10', 'TH-50', 'TH-81', '' ), Thai_Address_Autocomplete_Dataset::map_states( $provinces, $states ) );

		$data  = array(
			'version'      => 't',
			'provinces'    => $provinces,
			'districts'    => array( array( 0, 'a', 'a' ) ),
			'subdistricts' => array( array( 0, 'b', 'b', '10100' ) ),
		);
		$built = Thai_Address_Autocomplete_Dataset::client_payload( $data, $states );
		$this->assertSame( array( 'Atlantis (ไม่มี)' ), $built['unresolved'] );
		$this->assertSame( array( 'TH-10', 'กรุงเทพมหานคร', 'Bangkok' ), $built['payload']['provinces'][0] );
	}

	public function test_field_targets_with_default_fields() {
		$fields = array(
			'billing_address_1' => array(),
			'billing_address_2' => array(),
			'billing_city'      => array(),
			'billing_state'     => array(),
			'billing_postcode'  => array(),
		);
		$this->assertSame(
			array(
				'subdistrict' => 'address_2',
				'district'    => 'city',
				'province'    => 'state',
				'postcode'    => 'postcode',
			),
			Thai_Address_Autocomplete_Dataset::field_targets( $fields, 'billing_', 'address_2' )
		);
		$this->assertSame( 'address_1', Thai_Address_Autocomplete_Dataset::field_targets( $fields, 'billing_', 'address_1' )['subdistrict'] );
	}

	public function test_field_targets_respect_removed_and_hidden_fields() {
		$fields  = array(
			'address_1' => array(),
			// address_2 removed by the site.
			'city'      => array( 'hidden' => true ),
			'state'     => array(),
			'postcode'  => array( 'type' => 'hidden' ),
		);
		$targets = Thai_Address_Autocomplete_Dataset::field_targets( $fields, '', 'address_2' );
		$this->assertSame( 'address_1', $targets['subdistrict'], 'Falls back to appending to address_1' );
		$this->assertNull( $targets['district'] );
		$this->assertSame( 'state', $targets['province'] );
		$this->assertNull( $targets['postcode'] );

		$none = Thai_Address_Autocomplete_Dataset::field_targets( array(), 'shipping_', 'address_2' );
		$this->assertNull( $none['subdistrict'] );
	}
}
