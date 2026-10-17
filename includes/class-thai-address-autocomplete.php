<?php
/**
 * WordPress / WooCommerce integration: settings, adapters, assets, REST data, status report.
 *
 * @package Thai_Address_Autocomplete
 */

defined( 'ABSPATH' ) || exit;

/**
 * Plugin glue. All methods are static: there is one plugin, and nothing here holds state
 * beyond per-request caches.
 */
final class Thai_Address_Autocomplete {

	const PROVIDER_ID = 'thai_address_autocomplete';
	const OPTION      = 'thai_address_autocomplete_';
	const META        = 'thai_address_autocomplete_meta';
	const REST_NS     = 'thai-address-autocomplete/v1';
	const REST_ROUTE  = '/dataset';
	const SECTION     = 'thai_address_autocomplete';

	/**
	 * Whether the inline config has been printed on this request.
	 *
	 * @var bool
	 */
	private static $config_added = false;

	/**
	 * Hook everything. Called on plugins_loaded once requirements are met.
	 */
	public static function boot() {
		add_action( 'init', array( __CLASS__, 'load_textdomain' ), 1 );
		add_filter( 'woocommerce_get_sections_general', array( __CLASS__, 'settings_section' ) );
		add_filter( 'woocommerce_get_settings_general', array( __CLASS__, 'settings' ), 10, 2 );
		add_action( 'woocommerce_system_status_report', array( __CLASS__, 'status_report' ) );
		add_action( 'admin_notices', array( __CLASS__, 'unresolved_notice' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( THAI_ADDRESS_AUTOCOMPLETE_FILE ), array( __CLASS__, 'action_links' ) );

		// The provider is registered even when the plugin is disabled, so it stays selectable in WooCommerce settings.
		add_filter( 'woocommerce_address_providers', array( __CLASS__, 'register_provider' ) );

		if ( ! self::enabled() ) {
			return;
		}

		add_action( 'rest_api_init', array( __CLASS__, 'register_rest' ) );
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'serve_dataset' ), 10, 4 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_assets' ), 5 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_provider' ), 20 );

		// Plugin adapters (block checkout + classic forms). Skipped while the core provider adapter is active.
		add_action( 'woocommerce_blocks_checkout_block_registration', array( __CLASS__, 'register_blocks_integration' ) );
		add_action( 'woocommerce_before_checkout_billing_form', array( __CLASS__, 'enqueue_classic_checkout' ) );
		add_action( 'woocommerce_before_checkout_shipping_form', array( __CLASS__, 'enqueue_classic_checkout' ) );
		add_action( 'woocommerce_before_edit_account_address_form', array( __CLASS__, 'enqueue_classic_account' ) );
	}

	/**
	 * Load bundled translations. Translations from translate.wordpress.org (WP_LANG_DIR) take precedence.
	 */
	public static function load_textdomain() {
		// phpcs:ignore PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound -- Ships its own Thai translation.
		load_plugin_textdomain( 'thai-address-autocomplete-for-woocommerce', false, dirname( plugin_basename( THAI_ADDRESS_AUTOCOMPLETE_FILE ) ) . '/languages' );
	}

	/*
	 * ---------------------------------------------------------------------
	 * Settings
	 * ---------------------------------------------------------------------
	 */

	/**
	 * Read a plugin option with its default.
	 *
	 * @param string $key Option key without prefix.
	 * @return string
	 */
	public static function option( $key ) {
		$defaults = array(
			'enabled'           => 'yes',
			'placement'         => 'address_2',
			'language'          => 'auto',
			'checkout_billing'  => 'yes',
			'checkout_shipping' => 'yes',
			'my_account'        => 'yes',
		);
		return (string) get_option( self::OPTION . $key, $defaults[ $key ] );
	}

	/**
	 * Whether the plugin is switched on.
	 *
	 * @return bool
	 */
	public static function enabled() {
		return 'yes' === self::option( 'enabled' );
	}

	/**
	 * Add our section to WooCommerce → Settings → General.
	 *
	 * @param array $sections Sections.
	 * @return array
	 */
	public static function settings_section( $sections ) {
		if ( ! isset( $sections[''] ) ) {
			$sections = array( '' => __( 'General', 'thai-address-autocomplete-for-woocommerce' ) ) + (array) $sections;
		}
		$sections[ self::SECTION ] = __( 'Thai address autocomplete', 'thai-address-autocomplete-for-woocommerce' );
		return $sections;
	}

	/**
	 * Settings fields for our section.
	 *
	 * @param array  $settings Settings of the current section.
	 * @param string $section  Current section ID.
	 * @return array
	 */
	public static function settings( $settings, $section = '' ) {
		if ( self::SECTION !== $section ) {
			return $settings;
		}
		$p = self::OPTION;
		return array(
			array(
				'title' => __( 'Thai address autocomplete', 'thai-address-autocomplete-for-woocommerce' ),
				'type'  => 'title',
				/* translators: %s: name of the active adapter. */
				'desc'  => sprintf( __( 'Active adapter: %s', 'thai-address-autocomplete-for-woocommerce' ), self::adapter_label() ),
				'id'    => self::SECTION,
			),
			array(
				'title'   => __( 'Enable', 'thai-address-autocomplete-for-woocommerce' ),
				'desc'    => __( 'Suggest subdistrict, district, province and postcode when the country is Thailand', 'thai-address-autocomplete-for-woocommerce' ),
				'id'      => $p . 'enabled',
				'type'    => 'checkbox',
				'default' => 'yes',
			),
			array(
				'title'    => __( 'Subdistrict field', 'thai-address-autocomplete-for-woocommerce' ),
				'desc_tip' => __( 'Where to put the subdistrict (ตำบล / แขวง). Text the customer typed in address line 1 is never replaced.', 'thai-address-autocomplete-for-woocommerce' ),
				'id'       => $p . 'placement',
				'type'     => 'select',
				'default'  => 'address_2',
				'options'  => array(
					'address_2' => __( 'Address line 2', 'thai-address-autocomplete-for-woocommerce' ),
					'address_1' => __( 'Append to address line 1', 'thai-address-autocomplete-for-woocommerce' ),
				),
			),
			array(
				'title'   => __( 'Display language', 'thai-address-autocomplete-for-woocommerce' ),
				'id'      => $p . 'language',
				'type'    => 'select',
				'default' => 'auto',
				'options' => array(
					'auto' => __( 'Automatic (Thai when the site language is Thai, otherwise English)', 'thai-address-autocomplete-for-woocommerce' ),
					'th'   => __( 'Thai', 'thai-address-autocomplete-for-woocommerce' ),
					'en'   => __( 'English', 'thai-address-autocomplete-for-woocommerce' ),
				),
			),
			array(
				'title'         => __( 'Enable on', 'thai-address-autocomplete-for-woocommerce' ),
				'desc'          => __( 'Checkout: billing address', 'thai-address-autocomplete-for-woocommerce' ),
				'id'            => $p . 'checkout_billing',
				'type'          => 'checkbox',
				'default'       => 'yes',
				'checkboxgroup' => 'start',
			),
			array(
				'desc'          => __( 'Checkout: shipping address', 'thai-address-autocomplete-for-woocommerce' ),
				'id'            => $p . 'checkout_shipping',
				'type'          => 'checkbox',
				'default'       => 'yes',
				'checkboxgroup' => '',
			),
			array(
				'desc'          => __( 'My Account: edit addresses', 'thai-address-autocomplete-for-woocommerce' ),
				'id'            => $p . 'my_account',
				'type'          => 'checkbox',
				'default'       => 'yes',
				'checkboxgroup' => 'end',
			),
			array(
				'type' => 'sectionend',
				'id'   => self::SECTION,
			),
		);
	}

	/**
	 * Settings link on the Plugins screen.
	 *
	 * @param array $links Links.
	 * @return array
	 */
	public static function action_links( $links ) {
		$url = admin_url( 'admin.php?page=wc-settings&tab=general&section=' . self::SECTION );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'thai-address-autocomplete-for-woocommerce' ) . '</a>' );
		return $links;
	}

	/*
	 * ---------------------------------------------------------------------
	 * Adapter selection
	 * ---------------------------------------------------------------------
	 */

	/**
	 * Register our provider with WooCommerce's address autocomplete framework (WC 9.9+).
	 *
	 * @param array $providers Providers.
	 * @return array
	 */
	public static function register_provider( $providers ) {
		if ( class_exists( 'WC_Address_Provider' ) && is_array( $providers ) ) {
			require_once __DIR__ . '/class-thai-address-autocomplete-provider.php';
			$providers[] = new Thai_Address_Autocomplete_Provider();
		}
		return $providers;
	}

	/**
	 * Which adapter is active.
	 *
	 * 'core' when WooCommerce's address autocomplete is on and our provider is the preferred one.
	 * Otherwise 'plugin' (block checkout inner block + classic/My Account combobox). See docs/FINDINGS.md.
	 *
	 * @return string 'core', 'plugin' or 'off'.
	 */
	public static function adapter() {
		static $cached = null;
		if ( null !== $cached ) {
			return $cached;
		}
		$adapter    = self::enabled() ? 'plugin' : 'off';
		$controller = 'Automattic\WooCommerce\Internal\AddressProvider\AddressProviderController';
		if ( 'plugin' === $adapter && did_action( 'init' ) && class_exists( $controller ) && 'yes' === get_option( 'woocommerce_address_autocomplete_enabled', 'no' ) ) {
			try {
				if ( self::PROVIDER_ID === wc_get_container()->get( $controller )->get_preferred_provider() ) {
					$adapter = 'core';
				}
			} catch ( \Throwable $e ) {
				$adapter = 'plugin';
			}
		}
		/**
		 * Filter the active adapter.
		 *
		 * @since 1.0.0
		 * @param string $adapter 'core', 'plugin' or 'off'.
		 */
		$adapter = (string) apply_filters( 'thai_address_autocomplete_adapter', $adapter );
		if ( did_action( 'init' ) ) {
			// WooCommerce reads providers on init, so only cache the answer from then on.
			$cached = $adapter;
		}
		return $adapter;
	}

	/**
	 * Human label for the active adapter.
	 *
	 * @return string
	 */
	private static function adapter_label() {
		switch ( self::adapter() ) {
			case 'core':
				return __( 'WooCommerce address autocomplete provider (core framework)', 'thai-address-autocomplete-for-woocommerce' );
			case 'plugin':
				return __( 'Plugin adapters (block checkout lookup, classic checkout and My Account fields)', 'thai-address-autocomplete-for-woocommerce' );
			default:
				return __( 'Disabled', 'thai-address-autocomplete-for-woocommerce' );
		}
	}

	/*
	 * ---------------------------------------------------------------------
	 * Dataset
	 * ---------------------------------------------------------------------
	 */

	/**
	 * The dataset after the `thai_address_autocomplete_dataset` filter. Invalid filtered data falls back to the bundled file.
	 *
	 * @return array
	 */
	public static function dataset() {
		$file = THAI_ADDRESS_AUTOCOMPLETE_DIR . 'data/thai-address.json';
		$data = Thai_Address_Autocomplete_Dataset::from_file( $file );

		/**
		 * Replace or modify the address dataset.
		 *
		 * Return an array in the format documented in README.md ("Replacing the dataset"). Use
		 * Thai_Address_Autocomplete_Dataset::from_file( $path ) to load your own JSON file.
		 * Changes are picked up within a day, or immediately after deleting the
		 * `thai_address_autocomplete_meta` transient.
		 *
		 * @since 1.0.0
		 * @param array $data Bundled dataset.
		 */
		$filtered = apply_filters( 'thai_address_autocomplete_dataset', $data );
		if ( $filtered !== $data ) {
			$errors = Thai_Address_Autocomplete_Dataset::validate( $filtered );
			if ( ! $errors ) {
				return $filtered;
			}
			if ( function_exists( 'wc_get_logger' ) ) {
				wc_get_logger()->warning( 'Filtered dataset is invalid, using bundled data: ' . implode( ' ', $errors ), array( 'source' => 'thai-address-autocomplete' ) );
			}
		}
		return $data;
	}

	/**
	 * Client payload and its metadata.
	 *
	 * @param bool $with_payload Also return the payload (expensive); metadata alone is cached.
	 * @return array{hash: string, version: string, counts: int[], unresolved: string[], payload?: array}
	 */
	public static function meta( $with_payload = false ) {
		$key  = THAI_ADDRESS_AUTOCOMPLETE_VERSION . '|' . ( defined( 'WC_VERSION' ) ? WC_VERSION : '' );
		$meta = get_transient( self::META );
		if ( ! $with_payload && is_array( $meta ) && isset( $meta['key'] ) && $meta['key'] === $key ) {
			return $meta;
		}
		$data   = self::dataset();
		$states = WC()->countries->get_states( 'TH' );
		$built  = Thai_Address_Autocomplete_Dataset::client_payload( $data, is_array( $states ) ? $states : array() );
		$meta   = array(
			'key'        => $key,
			'hash'       => substr( md5( (string) wp_json_encode( $built['payload'] ) ), 0, 12 ),
			'version'    => $built['payload']['version'],
			'counts'     => array( count( $data['provinces'] ), count( $data['districts'] ), count( $data['subdistricts'] ) ),
			'unresolved' => $built['unresolved'],
		);
		set_transient( self::META, $meta, DAY_IN_SECONDS );
		if ( $with_payload ) {
			$meta['payload'] = $built['payload'];
		}
		return $meta;
	}

	/**
	 * Register the public, read-only dataset endpoint.
	 *
	 * No nonce or auth: it takes no input, returns the same public data to everyone, and the
	 * versioned URL lets browsers and CDNs cache the response for a year.
	 */
	public static function register_rest() {
		register_rest_route(
			self::REST_NS,
			self::REST_ROUTE,
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_dataset' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * REST callback.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_dataset( $request ) {
		$meta     = self::meta( true );
		$response = new WP_REST_Response( $meta['payload'] );
		$current  = (string) $request->get_param( 'v' ) === $meta['hash'];
		$response->header( 'Cache-Control', $current ? 'public, max-age=31536000, immutable' : 'public, max-age=300' );
		return $response;
	}

	/**
	 * Send our dataset as compact UTF-8 JSON. The default REST encoder escapes Thai characters
	 * as \uXXXX, which doubles the size.
	 *
	 * @param bool            $served  Whether the request was already served.
	 * @param mixed           $result  Result.
	 * @param WP_REST_Request $request Request.
	 * @param WP_REST_Server  $server  Server (unused).
	 * @return bool
	 */
	public static function serve_dataset( $served, $result, $request, $server = null ) {
		unset( $server );
		if ( $served || ! $result instanceof WP_HTTP_Response || $result->is_error() || '/' . self::REST_NS . self::REST_ROUTE !== $request->get_route() ) {
			return $served;
		}
		echo wp_json_encode( $result->get_data(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON response body.
		return true;
	}

	/*
	 * ---------------------------------------------------------------------
	 * Front end
	 * ---------------------------------------------------------------------
	 */

	/**
	 * Register scripts and styles (enqueued only where an address form renders).
	 */
	public static function register_assets() {
		$v   = THAI_ADDRESS_AUTOCOMPLETE_VERSION;
		$url = plugins_url( 'assets/', THAI_ADDRESS_AUTOCOMPLETE_FILE );
		$in  = array( 'in_footer' => true );
		wp_register_script( 'thai-address-autocomplete-search', $url . 'js/search.js', array(), $v, $in );
		wp_register_script( 'thai-address-autocomplete-combobox', $url . 'js/combobox.js', array( 'thai-address-autocomplete-search' ), $v, $in );
		wp_register_script( 'thai-address-autocomplete-classic', $url . 'js/classic.js', array( 'thai-address-autocomplete-combobox', 'jquery' ), $v, $in );
		wp_register_script( 'thai-address-autocomplete-provider', $url . 'js/provider.js', array( 'thai-address-autocomplete-search', 'wc-address-autocomplete-common' ), $v, $in );
		wp_register_style( 'thai-address-autocomplete', $url . 'css/autocomplete.css', array(), $v );
	}

	/**
	 * Core adapter: add our JS provider wherever WooCommerce loads its autocomplete registry.
	 */
	public static function maybe_enqueue_provider() {
		if ( 'core' === self::adapter() && wp_script_is( 'wc-address-autocomplete-common', 'enqueued' ) && ( is_checkout() || is_account_page() ) ) {
			self::add_config( 'thai-address-autocomplete-provider', 'core' );
			wp_enqueue_script( 'thai-address-autocomplete-provider' );
		}
	}

	/**
	 * Classic checkout adapter (fires only when the classic checkout form renders).
	 */
	public static function enqueue_classic_checkout() {
		if ( 'plugin' === self::adapter() && ( 'yes' === self::option( 'checkout_billing' ) || 'yes' === self::option( 'checkout_shipping' ) ) ) {
			self::enqueue_classic( 'checkout' );
		}
	}

	/**
	 * My Account → Addresses adapter (fires only when the edit-address form renders).
	 */
	public static function enqueue_classic_account() {
		if ( 'plugin' === self::adapter() && 'yes' === self::option( 'my_account' ) ) {
			self::enqueue_classic( 'account' );
		}
	}

	/**
	 * Enqueue classic assets.
	 *
	 * @param string $context 'checkout' or 'account'.
	 */
	private static function enqueue_classic( $context ) {
		if ( ! wp_script_is( 'thai-address-autocomplete-classic', 'registered' ) ) {
			self::register_assets();
		}
		self::add_config( 'thai-address-autocomplete-search', $context );
		wp_enqueue_script( 'thai-address-autocomplete-classic' );
		wp_enqueue_style( 'thai-address-autocomplete' );
	}

	/**
	 * Block checkout adapter.
	 *
	 * @param object $registry Automattic\WooCommerce\Blocks\Integrations\IntegrationRegistry.
	 */
	public static function register_blocks_integration( $registry ) {
		if ( 'plugin' !== self::adapter() || ! interface_exists( 'Automattic\WooCommerce\Blocks\Integrations\IntegrationInterface' ) ) {
			return;
		}
		if ( 'yes' !== self::option( 'checkout_billing' ) && 'yes' !== self::option( 'checkout_shipping' ) ) {
			return;
		}
		require_once __DIR__ . '/class-thai-address-autocomplete-blocks.php';
		$registry->register( new Thai_Address_Autocomplete_Blocks() );
	}

	/**
	 * Display language for dataset names.
	 *
	 * @return string 'th' or 'en'.
	 */
	public static function language() {
		$lang = self::option( 'language' );
		if ( 'th' === $lang || 'en' === $lang ) {
			return $lang;
		}
		return 0 === strpos( determine_locale(), 'th' ) ? 'th' : 'en';
	}

	/**
	 * Front-end config.
	 *
	 * @param string $context 'checkout', 'account', 'blocks' or 'core'.
	 * @return array
	 */
	public static function config( $context ) {
		$meta      = self::meta();
		$placement = 'address_1' === self::option( 'placement' ) ? 'address_1' : 'address_2';
		$types     = array();
		$targets   = array();

		if ( 'account' === $context ) {
			$types = array( 'billing', 'shipping' );
		} elseif ( 'core' !== $context ) {
			foreach ( array( 'billing', 'shipping' ) as $type ) {
				if ( 'yes' === self::option( 'checkout_' . $type ) ) {
					$types[] = $type;
				}
			}
		}

		foreach ( array( 'billing', 'shipping' ) as $type ) {
			if ( 'checkout' === $context && WC()->checkout() ) {
				// Classic checkout: includes customisations made with woocommerce_checkout_fields.
				$fields = WC()->checkout()->get_checkout_fields( $type );
			} else {
				// Blocks / My Account: address fields for Thailand, after woocommerce_{type}_fields and the country locale.
				$fields = WC()->countries->get_address_fields( 'TH', $type . '_' );
			}
			$targets[ $type ] = Thai_Address_Autocomplete_Dataset::field_targets( is_array( $fields ) ? $fields : array(), $type . '_', $placement );
		}

		if ( 'core' === $context ) {
			// address_1 is WooCommerce's search box in core mode, so never write to it.
			$targets['core'] = Thai_Address_Autocomplete_Dataset::field_targets( WC()->countries->get_address_fields( 'TH', '' ), '', 'address_2' );
			if ( 'address_1' === $targets['core']['subdistrict'] ) {
				$targets['core']['subdistrict'] = null;
			}
		}

		$config = array(
			'providerId' => self::PROVIDER_ID,
			'dataUrl'    => add_query_arg( 'v', $meta['hash'], rest_url( self::REST_NS . self::REST_ROUTE ) ),
			'lang'       => self::language(),
			'types'      => $types,
			'targets'    => $targets,
			'i18n'       => array(
				/* translators: %d: number of suggestions. */
				'results'     => __( '%d suggestions available. Use the up and down arrow keys to choose, Enter to select.', 'thai-address-autocomplete-for-woocommerce' ),
				'noResults'   => __( 'No matching area found.', 'thai-address-autocomplete-for-woocommerce' ),
				'error'       => __( 'Address suggestions are unavailable right now.', 'thai-address-autocomplete-for-woocommerce' ),
				'lookupLabel' => __( 'Find subdistrict, district, province or postcode', 'thai-address-autocomplete-for-woocommerce' ),
				'filled'      => __( 'Address filled in.', 'thai-address-autocomplete-for-woocommerce' ),
			),
		);

		/**
		 * Filter the front-end config.
		 *
		 * @since 1.0.0
		 * @param array  $config  Config.
		 * @param string $context 'checkout', 'account', 'blocks' or 'core'.
		 */
		return apply_filters( 'thai_address_autocomplete_config', $config, $context );
	}

	/**
	 * Print config once per request, before the given script.
	 *
	 * @param string $handle  Script handle.
	 * @param string $context Context.
	 */
	private static function add_config( $handle, $context ) {
		if ( self::$config_added ) {
			return;
		}
		self::$config_added = true;
		wp_add_inline_script( $handle, 'window.thaiAddressAutocompleteConfig = ' . wp_json_encode( self::config( $context ) ) . ';', 'before' );
	}

	/*
	 * ---------------------------------------------------------------------
	 * Admin
	 * ---------------------------------------------------------------------
	 */

	/**
	 * Warn when dataset provinces cannot be matched to WooCommerce states.
	 */
	public static function unresolved_notice() {
		if ( ! self::enabled() || ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || ! in_array( $screen->id, array( 'plugins', 'woocommerce_page_wc-settings', 'woocommerce_page_wc-status' ), true ) ) {
			return;
		}
		$meta = self::meta();
		if ( empty( $meta['unresolved'] ) ) {
			return;
		}
		printf(
			'<div class="notice notice-warning"><p>%s</p></div>',
			esc_html(
				sprintf(
					/* translators: %s: comma-separated province names. */
					__( 'Thai Address Autocomplete: these provinces do not match any WooCommerce state, so the Province field will not be filled for them: %s', 'thai-address-autocomplete-for-woocommerce' ),
					implode( ', ', $meta['unresolved'] )
				)
			)
		);
	}

	/**
	 * WooCommerce → Status → System Status section.
	 */
	public static function status_report() {
		$meta = self::meta();
		$rows = array(
			__( 'Enabled', 'thai-address-autocomplete-for-woocommerce' ) => self::enabled() ? __( 'Yes', 'thai-address-autocomplete-for-woocommerce' ) : __( 'No', 'thai-address-autocomplete-for-woocommerce' ),
			__( 'Active adapter', 'thai-address-autocomplete-for-woocommerce' ) => self::adapter_label(),
			__( 'WooCommerce address provider framework', 'thai-address-autocomplete-for-woocommerce' ) => class_exists( 'WC_Address_Provider' ) ? __( 'Available', 'thai-address-autocomplete-for-woocommerce' ) : __( 'Not available', 'thai-address-autocomplete-for-woocommerce' ),
			__( 'Dataset', 'thai-address-autocomplete-for-woocommerce' ) => sprintf( '%s (%d / %d / %d)', $meta['version'], $meta['counts'][0], $meta['counts'][1], $meta['counts'][2] ),
			__( 'Unresolved provinces', 'thai-address-autocomplete-for-woocommerce' ) => $meta['unresolved'] ? implode( ', ', $meta['unresolved'] ) : __( 'None', 'thai-address-autocomplete-for-woocommerce' ),
			__( 'Display language', 'thai-address-autocomplete-for-woocommerce' ) => self::language(),
			__( 'Subdistrict field', 'thai-address-autocomplete-for-woocommerce' ) => self::option( 'placement' ),
		);
		echo '<table class="wc_status_table widefat" cellspacing="0"><thead><tr><th colspan="3" data-export-label="Thai Address Autocomplete"><h2>'
			. esc_html__( 'Thai Address Autocomplete', 'thai-address-autocomplete-for-woocommerce' ) . '</h2></th></tr></thead><tbody>';
		foreach ( $rows as $label => $value ) {
			echo '<tr><td data-export-label="' . esc_attr( $label ) . '">' . esc_html( $label ) . ':</td><td class="help">&nbsp;</td><td>' . esc_html( $value ) . '</td></tr>';
		}
		echo '</tbody></table>';
	}
}
