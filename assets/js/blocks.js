/**
 * Thai Address Autocomplete: block checkout adapter.
 *
 * Registers a forced inner block in the shipping and billing address blocks through
 * @woocommerce/blocks-checkout (registerCheckoutBlock). WooCommerce renders it even if the
 * checkout page was never re-saved. A pick writes to the cart store (wc/store/cart), and
 * WooCommerce's own fields re-render from there. WooCommerce-rendered fields are never touched.
 */
( function ( wp, wc, tac ) {
	'use strict';

	if ( ! wp || ! wp.element || ! wp.data || ! wc || ! wc.blocksCheckout || ! wc.wcSettings || ! tac || ! tac.Combobox ) {
		return;
	}

	var cfg = wc.wcSettings.getSetting( 'thai-address-autocomplete_data', null );
	if ( ! cfg ) {
		return;
	}

	var el = wp.element.createElement;
	var useEffect = wp.element.useEffect;
	var useRef = wp.element.useRef;
	var useSelect = wp.data.useSelect;
	var CART = 'wc/store/cart';
	var CHECKOUT = 'wc/store/checkout';

	function addressKey( type ) {
		return type === 'shipping' ? 'shippingAddress' : 'billingAddress';
	}

	function currentAddress( type ) {
		var data = wp.data.select( CART ).getCustomerData();
		return ( data && data[ addressKey( type ) ] ) || {};
	}

	function mount( container, type ) {
		var id = 'thai-address-autocomplete-' + type;
		var previous = '';
		var wrap = document.createElement( 'div' );
		var input = document.createElement( 'input' );
		var label = document.createElement( 'label' );

		wrap.className = 'wc-block-components-text-input tac-lookup';
		input.type = 'text';
		input.id = id;
		input.setAttribute( 'autocomplete', 'off' );
		input.setAttribute( 'spellcheck', 'false' );
		label.htmlFor = id;
		label.textContent = cfg.i18n.lookupLabel;
		wrap.appendChild( input );
		wrap.appendChild( label );
		container.appendChild( wrap );

		function sync() {
			wrap.classList.toggle( 'is-active', document.activeElement === input || !! input.value );
		}
		input.addEventListener( 'focus', sync );
		input.addEventListener( 'blur', sync );
		input.addEventListener( 'input', sync );
		input.addEventListener(
			'focus',
			function () {
				tac.load( cfg.dataUrl ).catch( function () {} );
			},
			{ once: true }
		);

		var box = new tac.Combobox( input, {
			i18n: cfg.i18n,
			source: function ( query ) {
				return tac.suggest( cfg, query );
			},
			onSelect: function ( row ) {
				var targets = cfg.targets[ type ] || {};
				var values = tac.toAddress( row, {
					lang: cfg.lang,
					targets: targets,
					address1: currentAddress( type ).address_1,
					previous: previous,
				} );
				if ( targets.subdistrict === 'address_1' ) {
					previous = row.sub[ cfg.lang === 'en' ? 1 : 0 ];
				}
				var cart = wp.data.dispatch( CART );
				if ( type === 'shipping' ) {
					cart.setShippingAddress( values );
					var checkout = wp.data.select( CHECKOUT );
					if ( checkout && checkout.getUseShippingAsBilling && checkout.getUseShippingAsBilling() ) {
						cart.setBillingAddress( values );
					}
				} else {
					cart.setBillingAddress( values );
				}
				input.value = tac.label( row, cfg.lang );
				sync();
				box.announce( cfg.i18n.filled );
			},
		} );
		box.attach();

		return function () {
			box.detach();
			container.textContent = '';
		};
	}

	function makeComponent( type ) {
		return function ThaiAddressLookup() {
			var country = useSelect( function ( select ) {
				var data = select( CART ).getCustomerData();
				return data && data[ addressKey( type ) ] ? data[ addressKey( type ) ].country : '';
			}, [] );
			var ref = useRef( null );
			var on = country === 'TH';
			useEffect(
				function () {
					if ( on && ref.current ) {
						return mount( ref.current, type );
					}
				},
				[ on ]
			);
			return on ? el( 'div', { ref: ref, className: 'tac-block-lookup' } ) : null;
		};
	}

	cfg.types.forEach( function ( type ) {
		wc.blocksCheckout.registerCheckoutBlock( {
			metadata: {
				name: 'thai-address-autocomplete/' + type + '-lookup',
				parent: [ 'woocommerce/checkout-' + type + '-address-block' ],
				attributes: { lock: { type: 'object', default: { remove: true, move: true } } },
			},
			component: makeComponent( type ),
			force: true,
		} );
	} );
} )( window.wp, window.wc, window.thaiAddressAutocomplete );
