<?php
/**
 * Dataset loading, validation, province mapping and field mapping.
 *
 * Pure PHP with no WordPress or WooCommerce calls, so it can be unit tested on its own.
 *
 * @package Thai_Address_Autocomplete
 */

if ( ! defined( 'ABSPATH' ) && ! defined( 'THAI_ADDRESS_AUTOCOMPLETE_TESTS' ) ) {
	exit;
}

/**
 * Pure dataset helpers.
 *
 * Dataset format (see data/thai-address.json and README "Replacing the dataset"):
 *
 *     array(
 *         'version'      => 'kongvut-2026-09-29',
 *         'provinces'    => array( array( '10', 'กรุงเทพมหานคร', 'Bangkok' ), ... ),  // ISO 3166-2:TH code (with or without "TH-"), th, en
 *         'districts'    => array( array( 0, 'พระนคร', 'Phra Nakhon' ), ... ),        // province index, th, en
 *         'subdistricts' => array( array( 0, 'พระบรมมหาราชวัง', 'Phra Borom Maha Ratchawang', '10200' ), ... ), // district index, th, en, postcode
 *     )
 */
final class Thai_Address_Autocomplete_Dataset {

	/**
	 * Read a dataset JSON file.
	 *
	 * @param string $path Absolute path.
	 * @return array Decoded data, or an empty array if the file is missing or not valid JSON.
	 */
	public static function from_file( $path ) {
		if ( ! is_readable( $path ) ) {
			return array();
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local file bundled with the plugin.
		$data = json_decode( (string) file_get_contents( $path ), true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * Validate dataset structure.
	 *
	 * @param mixed $data Dataset.
	 * @return string[] Error messages (untranslated, for logs). Empty when valid.
	 */
	public static function validate( $data ) {
		if ( ! is_array( $data ) ) {
			return array( 'Dataset is not an array.' );
		}
		foreach ( array( 'provinces', 'districts', 'subdistricts' ) as $key ) {
			if ( empty( $data[ $key ] ) || ! is_array( $data[ $key ] ) ) {
				return array( "Missing or empty \"$key\"." );
			}
		}
		$errors = array();
		$counts = array(
			'provinces' => count( $data['provinces'] ),
			'districts' => count( $data['districts'] ),
		);
		$parent = array(
			'districts'    => 'provinces',
			'subdistricts' => 'districts',
		);
		foreach ( array( 'provinces', 'districts', 'subdistricts' ) as $key ) {
			foreach ( $data[ $key ] as $i => $row ) {
				$ok = is_array( $row ) && count( $row ) >= 3 && is_string( $row[1] ) && '' !== $row[1] && is_string( $row[2] );
				if ( $ok && isset( $parent[ $key ] ) ) {
					$ok = is_int( $row[0] ) && $row[0] >= 0 && $row[0] < $counts[ $parent[ $key ] ];
				}
				if ( $ok && 'provinces' === $key ) {
					$ok = is_string( $row[0] ) && '' !== $row[0];
				}
				if ( $ok && 'subdistricts' === $key ) {
					$ok = isset( $row[3] ) && 1 === preg_match( '/^\d{5}$/', (string) $row[3] );
				}
				if ( ! $ok ) {
					$errors[] = "Invalid $key row $i.";
					if ( count( $errors ) >= 10 ) {
						return $errors;
					}
				}
			}
		}
		return $errors;
	}

	/**
	 * Resolve each dataset province to a WooCommerce state code.
	 *
	 * Matching order: ISO 3166-2 code ("10" or "TH-10" → "TH-10"), then the English or Thai name
	 * compared with WooCommerce's (possibly translated) state label.
	 *
	 * @param array $provinces Dataset provinces.
	 * @param array $wc_states WooCommerce states for TH: code => label.
	 * @return string[] WooCommerce state code per province index ('' when unresolved).
	 */
	public static function map_states( array $provinces, array $wc_states ) {
		$by_name = array();
		foreach ( $wc_states as $code => $label ) {
			$by_name[ self::name_key( $label ) ] = (string) $code;
		}
		$out = array();
		foreach ( $provinces as $i => $p ) {
			$code = (string) $p[0];
			if ( 0 !== strpos( $code, 'TH-' ) ) {
				$code = 'TH-' . $code;
			}
			if ( isset( $wc_states[ $code ] ) ) {
				$out[ $i ] = $code;
			} elseif ( isset( $by_name[ self::name_key( $p[2] ) ] ) ) {
				$out[ $i ] = $by_name[ self::name_key( $p[2] ) ];
			} elseif ( isset( $by_name[ self::name_key( $p[1] ) ] ) ) {
				$out[ $i ] = $by_name[ self::name_key( $p[1] ) ];
			} else {
				$out[ $i ] = '';
			}
		}
		return $out;
	}

	/**
	 * Build the payload sent to the browser: provinces carry the WooCommerce state code.
	 *
	 * @param array $data      Valid dataset.
	 * @param array $wc_states WooCommerce states for TH.
	 * @return array{payload: array, unresolved: string[]} Payload and the names of unresolved provinces.
	 */
	public static function client_payload( array $data, array $wc_states ) {
		$states     = self::map_states( $data['provinces'], $wc_states );
		$provinces  = array();
		$unresolved = array();
		foreach ( $data['provinces'] as $i => $p ) {
			$provinces[] = array( $states[ $i ], (string) $p[1], (string) $p[2] );
			if ( '' === $states[ $i ] ) {
				$unresolved[] = $p[2] . ' (' . $p[1] . ')';
			}
		}
		return array(
			'payload'    => array(
				'version'      => isset( $data['version'] ) ? (string) $data['version'] : '',
				'provinces'    => $provinces,
				'districts'    => array_values( $data['districts'] ),
				'subdistricts' => array_values( $data['subdistricts'] ),
			),
			'unresolved' => $unresolved,
		);
	}

	/**
	 * Decide which address field receives each dataset level, based on the live field config.
	 *
	 * A field counts as present when it exists in the config and is not hidden. If the configured
	 * subdistrict field (address_2) is missing, the subdistrict is appended to address_1 instead.
	 *
	 * @param array  $fields    Field config as returned by WooCommerce (keys may be prefixed).
	 * @param string $prefix    Key prefix, e.g. 'billing_' or ''.
	 * @param string $placement 'address_2' or 'address_1' (append).
	 * @return array{subdistrict: ?string, district: ?string, province: ?string, postcode: ?string}
	 */
	public static function field_targets( array $fields, $prefix, $placement ) {
		$has = static function ( $key ) use ( $fields, $prefix ) {
			$f = isset( $fields[ $prefix . $key ] ) ? $fields[ $prefix . $key ] : null;
			return is_array( $f ) && empty( $f['hidden'] ) && ( ! isset( $f['type'] ) || 'hidden' !== $f['type'] );
		};
		$sub = null;
		if ( 'address_2' === $placement && $has( 'address_2' ) ) {
			$sub = 'address_2';
		} elseif ( $has( 'address_1' ) ) {
			$sub = 'address_1';
		}
		return array(
			'subdistrict' => $sub,
			'district'    => $has( 'city' ) ? 'city' : null,
			'province'    => $has( 'state' ) ? 'state' : null,
			'postcode'    => $has( 'postcode' ) ? 'postcode' : null,
		);
	}

	/**
	 * Comparable form of a name: lowercase ASCII, letters and digits only.
	 *
	 * @param string $name Name.
	 * @return string Key.
	 */
	private static function name_key( $name ) {
		return (string) preg_replace( '/[^\p{L}\p{N}]+/u', '', strtolower( (string) $name ) );
	}
}
