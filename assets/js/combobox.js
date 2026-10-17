/**
 * Thai Address Autocomplete: accessible combobox (WAI-ARIA 1.2 "list autocomplete" pattern).
 *
 * Attaches to an existing <input>. It adds a listbox and a polite live region to the input's container,
 * and removes them again in detach(). Text is inserted as text nodes, never as HTML.
 */
( function ( tac ) {
	'use strict';

	var uid = 0;

	function el( tag, attrs ) {
		var node = document.createElement( tag );
		Object.keys( attrs || {} ).forEach( function ( k ) {
			node.setAttribute( k, attrs[ k ] );
		} );
		return node;
	}

	/**
	 * @param {HTMLInputElement} input
	 * @param {Object}   opts
	 * @param {Function} opts.source   query => Promise<{ text: string, matches: {offset, length}[], value: * }[]>
	 * @param {Function} opts.onSelect value => void
	 * @param {Object}   opts.i18n     { results: '%d …', noResults: '…', error: '…' }
	 */
	function Combobox( input, opts ) {
		this.input = input;
		this.opts = opts;
		this.items = [];
		this.active = -1;
		this.seq = 0;
		this.timer = 0;
		this.attached = false;
		this.id = 'tac-listbox-' + ++uid;

		var self = this;
		this.onInput = function () {
			clearTimeout( self.timer );
			self.timer = setTimeout( function () {
				self.update();
			}, 120 );
		};
		this.onKeydown = function ( e ) {
			self.keydown( e );
		};
		this.onBlur = function () {
			setTimeout( function () {
				self.close();
			}, 0 );
		};
	}

	Combobox.prototype.attach = function () {
		if ( this.attached ) {
			return;
		}
		this.attached = true;
		this.list = el( 'ul', { id: this.id, role: 'listbox', class: 'tac-listbox', hidden: '' } );
		this.live = el( 'div', { role: 'status', 'aria-live': 'polite', class: 'tac-sr-only' } );
		// Keep focus in the input while clicking an option.
		this.list.addEventListener( 'mousedown', function ( e ) {
			e.preventDefault();
		} );
		// Append to the input's own container so sibling selectors such as `input + label` keep working.
		this.input.parentNode.appendChild( this.list );
		this.input.parentNode.appendChild( this.live );

		this.prevAutocomplete = this.input.getAttribute( 'autocomplete' );
		this.input.setAttribute( 'role', 'combobox' );
		this.input.setAttribute( 'aria-autocomplete', 'list' );
		this.input.setAttribute( 'aria-expanded', 'false' );
		this.input.setAttribute( 'aria-controls', this.id );
		this.input.addEventListener( 'input', this.onInput );
		this.input.addEventListener( 'keydown', this.onKeydown );
		this.input.addEventListener( 'blur', this.onBlur );
	};

	Combobox.prototype.detach = function () {
		if ( ! this.attached ) {
			return;
		}
		this.attached = false;
		this.close();
		clearTimeout( this.timer );
		this.list.remove();
		this.live.remove();
		[ 'role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant' ].forEach( function ( a ) {
			this.input.removeAttribute( a );
		}, this );
		this.input.removeEventListener( 'input', this.onInput );
		this.input.removeEventListener( 'keydown', this.onKeydown );
		this.input.removeEventListener( 'blur', this.onBlur );
	};

	Combobox.prototype.update = function () {
		var self = this;
		var seq = ++this.seq;
		Promise.resolve( this.opts.source( this.input.value ) )
			.then( function ( items ) {
				if ( seq === self.seq && self.attached && document.activeElement === self.input ) {
					self.render( items || [] );
				}
			} )
			.catch( function () {
				if ( seq === self.seq ) {
					self.close();
					self.announce( self.opts.i18n.error );
				}
			} );
	};

	Combobox.prototype.render = function ( items ) {
		var self = this;
		this.items = items;
		this.active = -1;
		this.list.textContent = '';
		this.input.removeAttribute( 'aria-activedescendant' );

		if ( ! items.length ) {
			this.close();
			if ( this.input.value.trim().length > 1 ) {
				this.announce( this.opts.i18n.noResults );
			}
			return;
		}

		items.forEach( function ( item, i ) {
			var li = el( 'li', { id: self.id + '-' + i, role: 'option', 'aria-selected': 'false', class: 'tac-option' } );
			var pos = 0;
			( item.matches || [] ).forEach( function ( m ) {
				li.appendChild( document.createTextNode( item.text.slice( pos, m.offset ) ) );
				var mark = el( 'mark' );
				mark.textContent = item.text.substr( m.offset, m.length );
				li.appendChild( mark );
				pos = m.offset + m.length;
			} );
			li.appendChild( document.createTextNode( item.text.slice( pos ) ) );
			li.addEventListener( 'click', function () {
				self.choose( i );
			} );
			self.list.appendChild( li );
		} );

		// Position under the input, relative to the input's offsetParent (no styles on elements we do not own).
		this.list.style.top = this.input.offsetTop + this.input.offsetHeight + 'px';
		this.list.style.left = this.input.offsetLeft + 'px';
		this.list.style.width = this.input.offsetWidth + 'px';
		this.list.hidden = false;
		this.input.setAttribute( 'aria-expanded', 'true' );
		this.announce( this.opts.i18n.results.replace( '%d', items.length ) );
	};

	Combobox.prototype.announce = function ( text ) {
		var live = this.live;
		live.textContent = '';
		// A short delay makes screen readers announce repeated identical messages.
		setTimeout( function () {
			live.textContent = text || '';
		}, 50 );
	};

	Combobox.prototype.isOpen = function () {
		return this.list && ! this.list.hidden;
	};

	Combobox.prototype.close = function () {
		if ( ! this.list ) {
			return;
		}
		this.list.hidden = true;
		this.active = -1;
		this.input.setAttribute( 'aria-expanded', 'false' );
		this.input.removeAttribute( 'aria-activedescendant' );
	};

	Combobox.prototype.highlight = function ( i ) {
		var options = this.list.children;
		if ( this.active >= 0 && options[ this.active ] ) {
			options[ this.active ].setAttribute( 'aria-selected', 'false' );
		}
		this.active = i;
		if ( i >= 0 && options[ i ] ) {
			options[ i ].setAttribute( 'aria-selected', 'true' );
			this.input.setAttribute( 'aria-activedescendant', options[ i ].id );
			if ( options[ i ].scrollIntoView ) {
				options[ i ].scrollIntoView( { block: 'nearest' } );
			}
		}
	};

	Combobox.prototype.choose = function ( i ) {
		var item = this.items[ i ];
		this.close();
		if ( item ) {
			this.opts.onSelect( item.value );
		}
	};

	Combobox.prototype.keydown = function ( e ) {
		var n = this.items.length;
		switch ( e.key ) {
			case 'ArrowDown':
			case 'Down':
				e.preventDefault();
				if ( ! this.isOpen() ) {
					this.update();
					return;
				}
				this.highlight( ( this.active + 1 ) % n );
				break;
			case 'ArrowUp':
			case 'Up':
				if ( this.isOpen() ) {
					e.preventDefault();
					this.highlight( this.active <= 0 ? n - 1 : this.active - 1 );
				}
				break;
			case 'Enter':
				// Only swallow Enter when an option is highlighted, so the form still submits otherwise.
				if ( this.isOpen() && this.active >= 0 ) {
					e.preventDefault();
					this.choose( this.active );
				}
				break;
			case 'Escape':
			case 'Esc':
				if ( this.isOpen() ) {
					e.preventDefault();
					e.stopPropagation();
					this.close();
				}
				break;
			case 'Tab':
				this.close();
				break;
		}
	};

	tac.Combobox = Combobox;

	/**
	 * Build combobox items for a query using the shared index.
	 *
	 * @param {Object} cfg   Plugin config (dataUrl, lang).
	 * @param {string} query Input value.
	 * @return {Promise<Object[]>} Items.
	 */
	tac.suggest = function ( cfg, query ) {
		if ( String( query ).trim().length < 2 ) {
			return Promise.resolve( [] );
		}
		return tac.load( cfg.dataUrl ).then( function ( index ) {
			return tac.search( index, query ).map( function ( row ) {
				var text = tac.label( row, cfg.lang );
				return { text: text, matches: tac.matches( text, query ), value: row };
			} );
		} );
	};
} )( window.thaiAddressAutocomplete );
