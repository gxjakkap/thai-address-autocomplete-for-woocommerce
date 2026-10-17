/**
 * Thai Address Autocomplete: classic checkout and My Account adapter.
 *
 * Attaches a combobox to the standard WooCommerce fields ({type}_postcode, {type}_city and, when it is
 * the subdistrict target, {type}_address_2). address_1 is never used as a search box. It is only
 * appended to when the merchant chose that placement.
 * Active only while {type}_country is TH, re-evaluated on country_to_state_changed.
 */
( function ( $, tac, cfg ) {
	'use strict';

	if ( ! tac || ! tac.Combobox || ! cfg ) {
		return;
	}

	var boxes = {};
	var previous = {};

	function field( type, key ) {
		return document.getElementById( type + '_' + key );
	}

	function setValue( el, value ) {
		if ( ! el || el.value === value ) {
			return;
		}
		if ( el.tagName === 'SELECT' ) {
			var exists = Array.prototype.some.call( el.options, function ( o ) {
				return o.value === value;
			} );
			if ( ! exists ) {
				return;
			}
		}
		el.value = value;
		// Native events reach jQuery handlers too (WooCommerce update_checkout, selectWoo display).
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	}

	function fill( type, row ) {
		var targets = cfg.targets[ type ] || {};
		var address1 = field( type, 'address_1' );
		var values = tac.toAddress( row, {
			lang: cfg.lang,
			targets: targets,
			address1: address1 ? address1.value : '',
			previous: previous[ type ],
		} );
		if ( targets.subdistrict === 'address_1' ) {
			previous[ type ] = row.sub[ cfg.lang === 'en' ? 1 : 0 ];
		}
		// State first: WooCommerce may refresh the checkout on state change.
		[ 'state', 'city', 'postcode', 'address_2', 'address_1' ].forEach( function ( key ) {
			if ( Object.prototype.hasOwnProperty.call( values, key ) ) {
				setValue( field( type, key ), values[ key ] );
			}
		} );
	}

	function setup( type ) {
		var t = cfg.targets[ type ] || {};
		var keys = [];
		if ( t.postcode ) {
			keys.push( t.postcode );
		}
		if ( t.district ) {
			keys.push( t.district );
		}
		if ( t.subdistrict && t.subdistrict !== 'address_1' ) {
			keys.push( t.subdistrict );
		}
		boxes[ type ] = keys
			.map( function ( key ) {
				return field( type, key );
			} )
			.filter( function ( el ) {
				return el && el.tagName === 'INPUT';
			} )
			.map( function ( el ) {
				el.addEventListener(
					'focus',
					function () {
						if ( boxes[ type ] && boxes[ type ][ 0 ].attached ) {
							tac.load( cfg.dataUrl ).catch( function () {} );
						}
					},
					{ once: true }
				);
				return new tac.Combobox( el, {
					source: function ( query ) {
						return tac.suggest( cfg, query );
					},
					onSelect: function ( row ) {
						fill( type, row );
					},
					i18n: cfg.i18n,
				} );
			} );
	}

	function refresh() {
		cfg.types.forEach( function ( type ) {
			var country = field( type, 'country' );
			var on = !! country && country.value === 'TH';
			( boxes[ type ] || [] ).forEach( function ( box ) {
				if ( on ) {
					box.attach();
				} else {
					box.detach();
				}
			} );
		} );
	}

	function init() {
		cfg.types.forEach( function ( type ) {
			if ( field( type, 'country' ) ) {
				setup( type );
			}
		} );
		refresh();
		if ( $ ) {
			$( document.body ).on( 'country_to_state_changed updated_checkout', refresh );
		}
		document.addEventListener( 'change', function ( e ) {
			if ( e.target && /_country$/.test( e.target.id || '' ) ) {
				refresh();
			}
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )( window.jQuery, window.thaiAddressAutocomplete, window.thaiAddressAutocompleteConfig );
