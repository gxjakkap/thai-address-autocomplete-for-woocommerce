/**
 * Thai Address Autocomplete: core search module.
 *
 * Has no dependencies. It runs in the browser (it adds `window.thaiAddressAutocomplete`) and in
 * Node for tests (`module.exports`).
 *
 * The payload comes from the plugin's REST endpoint:
 * {
 *   version: string,
 *   provinces:    [ [ wcStateCode, th, en ], ... ],
 *   districts:    [ [ provinceIndex, th, en ], ... ],
 *   subdistricts: [ [ districtIndex, th, en, postcode ], ... ]
 * }
 */
( function ( root, factory ) {
	if ( typeof module === 'object' && module.exports ) {
		module.exports = factory();
	} else {
		root.thaiAddressAutocomplete = Object.assign( root.thaiAddressAutocomplete || {}, factory() );
	}
} )( typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	var LANG = { th: 0, en: 1 };
	var MAX_RESULTS = 10;
	var MIN_QUERY = 2;

	// Administrative prefixes customers often type ("ต.บางมด", "Khet Thung Khru"). They are not part of the names.
	var PREFIX_RE = /^(ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ต\.|อ\.|จ\.)/;
	var PREFIX_WORDS = { tambon: 1, khwaeng: 1, amphoe: 1, khet: 1, changwat: 1 };

	function normalize( value ) {
		var s = String( value == null ? '' : value );
		if ( s.normalize ) {
			s = s.normalize( 'NFC' );
		}
		return s.toLowerCase().replace( /[\s​\-.,'’()]/g, '' );
	}

	function tokenize( query ) {
		return String( query == null ? '' : query )
			.split( /[\s,/»>]+/ )
			.map( function ( t ) {
				return t.replace( PREFIX_RE, '' );
			} )
			.filter( function ( t ) {
				return t && ! PREFIX_WORDS[ t.toLowerCase() ];
			} )
			.map( normalize )
			.filter( Boolean );
	}

	/**
	 * Build a search index from a payload.
	 *
	 * @param {Object} payload Dataset payload.
	 * @return {{version: string, rows: Object[]}} Index.
	 */
	function createIndex( payload ) {
		var p = payload.provinces;
		var d = payload.districts;
		var rows = payload.subdistricts.map( function ( s, i ) {
			var dist = d[ s[ 0 ] ];
			var prov = p[ dist[ 0 ] ];
			return {
				id: i,
				state: prov[ 0 ] || '',
				sub: [ s[ 1 ], s[ 2 ] ],
				dist: [ dist[ 1 ], dist[ 2 ] ],
				prov: [ prov[ 1 ], prov[ 2 ] ],
				postcode: String( s[ 3 ] ),
				// Normalized names per level: subdistrict (weight 3), district (2), province (1).
				n: [
					[ normalize( s[ 1 ] ), normalize( s[ 2 ] ) ],
					[ normalize( dist[ 1 ] ), normalize( dist[ 2 ] ) ],
					[ normalize( prov[ 1 ] ), normalize( prov[ 2 ] ) ],
				],
			};
		} );
		return { version: payload.version, rows: rows };
	}

	/**
	 * Score one token against one row. 0 = no match.
	 * Ranking: exact postcode > exact name > prefix (postcode or name) > substring.
	 * Inside the same match type, subdistrict beats district beats province.
	 *
	 * @param {Object} row   Index row.
	 * @param {string} token Normalized token.
	 * @return {number} Score.
	 */
	function scoreToken( row, token ) {
		if ( /^\d+$/.test( token ) ) {
			if ( row.postcode === token ) {
				return 400;
			}
			return row.postcode.indexOf( token ) === 0 ? 200 : 0;
		}
		var best = 0;
		for ( var level = 0; level < 3; level++ ) {
			for ( var l = 0; l < 2; l++ ) {
				var name = row.n[ level ][ l ];
				var pos = name.indexOf( token );
				if ( pos === -1 ) {
					continue;
				}
				var base = name === token ? 300 : pos === 0 ? 200 : 100;
				var score = base + ( 3 - level );
				if ( score > best ) {
					best = score;
				}
			}
		}
		return best;
	}

	/**
	 * Search the index. Every token must match, or the whole query must match as one phrase.
	 * Results are sorted by score, then dataset order.
	 *
	 * @param {Object} index Index from createIndex().
	 * @param {string} query Raw user input.
	 * @param {number} [limit] Max results (default 10).
	 * @return {Object[]} Matching rows.
	 */
	function search( index, query, limit ) {
		var tokens = tokenize( query );
		if ( ! tokens.length || tokens.join( '' ).length < MIN_QUERY ) {
			return [];
		}
		var hits = [];
		var rows = index.rows;
		// Multi-word names ("chiang mai", "เมือง เชียงใหม่") also match as one phrase, which ranks first.
		var phrase = tokens.length > 1 ? tokens.join( '' ) : '';
		for ( var i = 0; i < rows.length; i++ ) {
			var total = 0;
			for ( var t = 0; t < tokens.length; t++ ) {
				var s = scoreToken( rows[ i ], tokens[ t ] );
				if ( ! s ) {
					total = 0;
					break;
				}
				total += s;
			}
			var p = phrase ? scoreToken( rows[ i ], phrase ) : 0;
			if ( p ) {
				total += 1000 + p;
			}
			if ( total ) {
				hits.push( { row: rows[ i ], score: total } );
			}
		}
		hits.sort( function ( a, b ) {
			return b.score - a.score || a.row.id - b.row.id;
		} );
		return hits.slice( 0, limit || MAX_RESULTS ).map( function ( h ) {
			return h.row;
		} );
	}

	function names( row, lang ) {
		var l = LANG[ lang ] === undefined ? 0 : LANG[ lang ];
		return { sub: row.sub[ l ], dist: row.dist[ l ], prov: row.prov[ l ] };
	}

	/**
	 * Suggestion label, e.g. "บางมด » ทุ่งครุ » กรุงเทพมหานคร » 10140".
	 *
	 * @param {Object} row  Index row.
	 * @param {string} lang 'th' or 'en'.
	 * @return {string} Label.
	 */
	function label( row, lang ) {
		var n = names( row, lang );
		return [ n.sub, n.dist, n.prov, row.postcode ].join( ' » ' );
	}

	/**
	 * Ranges of the label that match the query, for highlighting.
	 *
	 * @param {string} text  Label.
	 * @param {string} query Raw user input.
	 * @return {{offset: number, length: number}[]} Non-overlapping ranges sorted by offset.
	 */
	function matches( text, query ) {
		var lower = text.toLowerCase();
		var out = [];
		String( query || '' )
			.split( /[\s,/»>]+/ )
			.map( function ( t ) {
				return t.replace( PREFIX_RE, '' ).toLowerCase();
			} )
			.filter( Boolean )
			.forEach( function ( t ) {
				var pos = lower.indexOf( t );
				if ( pos !== -1 ) {
					out.push( { offset: pos, length: t.length } );
				}
			} );
		out.sort( function ( a, b ) {
			return a.offset - b.offset;
		} );
		return out.filter( function ( m, i ) {
			return ! i || m.offset >= out[ i - 1 ].offset + out[ i - 1 ].length;
		} );
	}

	/**
	 * Append a subdistrict to the customer's address_1 without losing what they typed.
	 * If this plugin appended a different subdistrict earlier, that one is replaced.
	 *
	 * @param {string} current  Current address_1 value.
	 * @param {string} sub      Subdistrict to add.
	 * @param {string} previous Subdistrict this plugin appended last time, if any.
	 * @return {string} New address_1 value.
	 */
	function appendSubdistrict( current, sub, previous ) {
		var value = String( current || '' ).replace( /\s+$/, '' );
		if ( previous && previous !== sub && value.slice( -previous.length ) === previous ) {
			value = value.slice( 0, -previous.length ).replace( /\s+$/, '' );
		}
		if ( value.slice( -sub.length ) === sub ) {
			return value;
		}
		return value ? value + ' ' + sub : sub;
	}

	/**
	 * Map a row onto WooCommerce address keys.
	 *
	 * @param {Object} row  Index row.
	 * @param {Object} opts { lang, targets: {subdistrict, district, province, postcode}, address1, previous }
	 *                      Targets come from the live field config (PHP). A null target is skipped.
	 * @return {Object} Partial address, e.g. { state: 'TH-10', city: 'ทุ่งครุ', postcode: '10140', address_2: 'บางมด' }.
	 */
	function toAddress( row, opts ) {
		var n = names( row, opts.lang );
		var t = opts.targets || {};
		var out = {};
		if ( t.province && row.state ) {
			out[ t.province ] = row.state;
		}
		if ( t.district ) {
			out[ t.district ] = n.dist;
		}
		if ( t.postcode ) {
			out[ t.postcode ] = row.postcode;
		}
		if ( t.subdistrict === 'address_1' ) {
			out.address_1 = appendSubdistrict( opts.address1, n.sub, opts.previous );
		} else if ( t.subdistrict ) {
			out[ t.subdistrict ] = n.sub;
		}
		return out;
	}

	var loading = {};

	/**
	 * Fetch and index the dataset once per URL.
	 *
	 * @param {string} url Dataset URL.
	 * @return {Promise<Object>} Index.
	 */
	function load( url ) {
		if ( ! loading[ url ] ) {
			loading[ url ] = fetch( url, { credentials: 'same-origin' } )
				.then( function ( r ) {
					if ( ! r.ok ) {
						throw new Error( 'HTTP ' + r.status );
					}
					return r.json();
				} )
				.then( createIndex )
				.catch( function ( e ) {
					delete loading[ url ];
					throw e;
				} );
		}
		return loading[ url ];
	}

	return {
		normalize: normalize,
		tokenize: tokenize,
		createIndex: createIndex,
		search: search,
		label: label,
		matches: matches,
		appendSubdistrict: appendSubdistrict,
		toAddress: toAddress,
		load: load,
	};
} );
