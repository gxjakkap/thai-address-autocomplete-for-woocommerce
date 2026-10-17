/**
 * Thai Address Autocomplete: provider for WooCommerce's address autocomplete framework (core adapter).
 *
 * WooCommerce owns the UI (address_1 is the search box). This provider answers for TH only and
 * never returns address_1, so the customer's text there is kept.
 */
( function ( wc, tac, cfg ) {
	'use strict';

	if ( ! wc || ! wc.addressAutocomplete || ! wc.addressAutocomplete.registerAddressAutocompleteProvider || ! tac || ! cfg ) {
		return;
	}

	wc.addressAutocomplete.registerAddressAutocompleteProvider( {
		id: cfg.providerId,
		canSearch: function ( country ) {
			return country === 'TH';
		},
		search: function ( query ) {
			return tac.load( cfg.dataUrl ).then( function ( index ) {
				return tac.search( index, query ).map( function ( row ) {
					var label = tac.label( row, cfg.lang );
					return { id: String( row.id ), label: label, matchedSubstrings: tac.matches( label, query ) };
				} );
			} );
		},
		select: function ( id ) {
			return tac.load( cfg.dataUrl ).then( function ( index ) {
				var row = index.rows[ parseInt( id, 10 ) ];
				return row ? tac.toAddress( row, { lang: cfg.lang, targets: cfg.targets.core } ) : null;
			} );
		},
	} );
} )( window.wc, window.thaiAddressAutocomplete, window.thaiAddressAutocompleteConfig );
