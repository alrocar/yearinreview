( function () {

	const _changeEvent = {
		type: 'change'
	};
	const _startEvent = {
		type: 'start'
	};
	const _endEvent = {
		type: 'end'
	};

	class TrackballControls extends THREE.EventDispatcher {

		constructor( object, domElement ) {

			super();
			if ( domElement === undefined ) console.warn( 'THREE.TrackballControls: The second parameter "domElement" is now mandatory.' );
			if ( domElement === document ) console.error( 'THREE.TrackballControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );
			const scope = this;
			const STATE = {
				NONE: - 1,
				ROTATE: 0,
				ZOOM: 1,
				PAN: 2,
				TOUCH_ROTATE: 3,
				TOUCH_ZOOM_PAN: 4
			};
			this.object = object;
			this.domElement = domElement;
			this.domElement.style.touchAction = 'none'; // disable touch scroll
			// API

			this.enabled = true;
			this.screen = {
				left: 0,
				top: 0,
				width: 0,
				height: 0
			};
			this.rotateSpeed = 1.0;
			this.zoomSpeed = 1.2;
			this.panSpeed = 0.3;
			this.noRotate = false;
			this.noZoom = false;
			this.noPan = false;
			this.staticMoving = false;
			this.dynamicDampingFactor = 0.2;
			this.minDistance = 0;
			this.maxDistance = Infinity;
			this.keys = [ 'KeyA',
				/*A*/
				'KeyS',
				/*S*/
				'KeyD'
				/*D*/
			];
			this.mouseButtons = {
				LEFT: THREE.MOUSE.ROTATE,
				MIDDLE: THREE.MOUSE.DOLLY,
				RIGHT: THREE.MOUSE.PAN
			}; // internals

			this.target = new THREE.Vector3();
			const EPS = 0.000001;
			const lastPosition = new THREE.Vector3();
			let lastZoom = 1;
			let _state = STATE.NONE,
				_keyState = STATE.NONE,
				_touchZoomDistanceStart = 0,
				_touchZoomDistanceEnd = 0,
				_lastAngle = 0;

			const _eye = new THREE.Vector3(),
				_movePrev = new THREE.Vector2(),
				_moveCurr = new THREE.Vector2(),
				_lastAxis = new THREE.Vector3(),
				_zoomStart = new THREE.Vector2(),
				_zoomEnd = new THREE.Vector2(),
				_panStart = new THREE.Vector2(),
				_panEnd = new THREE.Vector2(),
				_pointers = [],
				_pointerPositions = {}; // for reset


			this.target0 = this.target.clone();
			this.position0 = this.object.position.clone();
			this.up0 = this.object.up.clone();
			this.zoom0 = this.object.zoom; // methods

			this.handleResize = function () {

				const box = scope.domElement.getBoundingClientRect(); // adjustments come from similar code in the jquery offset() function

				const d = scope.domElement.ownerDocument.documentElement;
				scope.screen.left = box.left + window.pageXOffset - d.clientLeft;
				scope.screen.top = box.top + window.pageYOffset - d.clientTop;
				scope.screen.width = box.width;
				scope.screen.height = box.height;

			};

			const getMouseOnScreen = function () {

				const vector = new THREE.Vector2();
				return function getMouseOnScreen( pageX, pageY ) {

					vector.set( ( pageX - scope.screen.left ) / scope.screen.width, ( pageY - scope.screen.top ) / scope.screen.height );
					return vector;

				};

			}();

			const getMouseOnCircle = function () {

				const vector = new THREE.Vector2();
				return function getMouseOnCircle( pageX, pageY ) {

					vector.set( ( pageX - scope.screen.width * 0.5 - scope.screen.left ) / ( scope.screen.width * 0.5 ), ( scope.screen.height + 2 * ( scope.screen.top - pageY ) ) / scope.screen.width // screen.width intentional
					);
					return vector;

				};

			}();

			this.rotateCamera = function () {

				const axis = new THREE.Vector3(),
					quaternion = new THREE.Quaternion(),
					eyeDirection = new THREE.Vector3(),
					objectUpDirection = new THREE.Vector3(),
					objectSidewaysDirection = new THREE.Vector3(),
					moveDirection = new THREE.Vector3();
				return function rotateCamera() {

					moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
					let angle = moveDirection.length();

					if ( angle ) {

						_eye.copy( scope.object.position ).sub( scope.target );

						eyeDirection.copy( _eye ).normalize();
						objectUpDirection.copy( scope.object.up ).normalize();
						objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();
						objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
						objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );
						moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );
						axis.crossVectors( moveDirection, _eye ).normalize();
						angle *= scope.rotateSpeed;
						quaternion.setFromAxisAngle( axis, angle );

						_eye.applyQuaternion( quaternion );

						scope.object.up.applyQuaternion( quaternion );

						_lastAxis.copy( axis );

						_lastAngle = angle;

					} else if ( ! scope.staticMoving && _lastAngle ) {

						_lastAngle *= Math.sqrt( 1.0 - scope.dynamicDampingFactor );

						_eye.copy( scope.object.position ).sub( scope.target );

						quaternion.setFromAxisAngle( _lastAxis, _lastAngle );

						_eye.applyQuaternion( quaternion );

						scope.object.up.applyQuaternion( quaternion );

					}

					_movePrev.copy( _moveCurr );

				};

			}();

			this.zoomCamera = function () {

				let factor;

				if ( _state === STATE.TOUCH_ZOOM_PAN ) {

					factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
					_touchZoomDistanceStart = _touchZoomDistanceEnd;

					if ( scope.object.isPerspectiveCamera ) {

						_eye.multiplyScalar( factor );

					} else if ( scope.object.isOrthographicCamera ) {

						scope.object.zoom /= factor;
						scope.object.updateProjectionMatrix();

					} else {

						console.warn( 'THREE.TrackballControls: Unsupported camera type' );

					}

				} else {

					factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * scope.zoomSpeed;

					if ( factor !== 1.0 && factor > 0.0 ) {

						if ( scope.object.isPerspectiveCamera ) {

							_eye.multiplyScalar( factor );

						} else if ( scope.object.isOrthographicCamera ) {

							scope.object.zoom /= factor;
							scope.object.updateProjectionMatrix();

						} else {

							console.warn( 'THREE.TrackballControls: Unsupported camera type' );

						}

					}

					if ( scope.staticMoving ) {

						_zoomStart.copy( _zoomEnd );

					} else {

						_zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;

					}

				}

			};

			this.panCamera = function () {

				const mouseChange = new THREE.Vector2(),
					objectUp = new THREE.Vector3(),
					pan = new THREE.Vector3();
				return function panCamera() {

					mouseChange.copy( _panEnd ).sub( _panStart );

					if ( mouseChange.lengthSq() ) {

						if ( scope.object.isOrthographicCamera ) {

							const scale_x = ( scope.object.right - scope.object.left ) / scope.object.zoom / scope.domElement.clientWidth;
							const scale_y = ( scope.object.top - scope.object.bottom ) / scope.object.zoom / scope.domElement.clientWidth;
							mouseChange.x *= scale_x;
							mouseChange.y *= scale_y;

						}

						mouseChange.multiplyScalar( _eye.length() * scope.panSpeed );
						pan.copy( _eye ).cross( scope.object.up ).setLength( mouseChange.x );
						pan.add( objectUp.copy( scope.object.up ).setLength( mouseChange.y ) );
						scope.object.position.add( pan );
						scope.target.add( pan );

						if ( scope.staticMoving ) {

							_panStart.copy( _panEnd );

						} else {

							_panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( scope.dynamicDampingFactor ) );

						}

					}

				};

			}();

			this.checkDistances = function () {

				if ( ! scope.noZoom || ! scope.noPan ) {

					if ( _eye.lengthSq() > scope.maxDistance * scope.maxDistance ) {

						scope.object.position.addVectors( scope.target, _eye.setLength( scope.maxDistance ) );

						_zoomStart.copy( _zoomEnd );

					}

					if ( _eye.lengthSq() < scope.minDistance * scope.minDistance ) {

						scope.object.position.addVectors( scope.target, _eye.setLength( scope.minDistance ) );

						_zoomStart.copy( _zoomEnd );

					}

				}

			};

			this.update = function () {

				_eye.subVectors( scope.object.position, scope.target );

				if ( ! scope.noRotate ) {

					scope.rotateCamera();

				}

				if ( ! scope.noZoom ) {

					scope.zoomCamera();

				}

				if ( ! scope.noPan ) {

					scope.panCamera();

				}

				scope.object.position.addVectors( scope.target, _eye );

				if ( scope.object.isPerspectiveCamera ) {

					scope.checkDistances();
					scope.object.lookAt( scope.target );

					if ( lastPosition.distanceToSquared( scope.object.position ) > EPS ) {

						scope.dispatchEvent( _changeEvent );
						lastPosition.copy( scope.object.position );

					}

				} else if ( scope.object.isOrthographicCamera ) {

					scope.object.lookAt( scope.target );

					if ( lastPosition.distanceToSquared( scope.object.position ) > EPS || lastZoom !== scope.object.zoom ) {

						scope.dispatchEvent( _changeEvent );
						lastPosition.copy( scope.object.position );
						lastZoom = scope.object.zoom;

					}

				} else {

					console.warn( 'THREE.TrackballControls: Unsupported camera type' );

				}

			};

			this.reset = function () {

				_state = STATE.NONE;
				_keyState = STATE.NONE;
				scope.target.copy( scope.target0 );
				scope.object.position.copy( scope.position0 );
				scope.object.up.copy( scope.up0 );
				scope.object.zoom = scope.zoom0;
				scope.object.updateProjectionMatrix();

				_eye.subVectors( scope.object.position, scope.target );

				scope.object.lookAt( scope.target );
				scope.dispatchEvent( _changeEvent );
				lastPosition.copy( scope.object.position );
				lastZoom = scope.object.zoom;

			}; // listeners


			function onPointerDown( event ) {

				if ( scope.enabled === false ) return;

				if ( _pointers.length === 0 ) {

					scope.domElement.setPointerCapture( event.pointerId );
					scope.domElement.addEventListener( 'pointermove', onPointerMove );
					scope.domElement.addEventListener( 'pointerup', onPointerUp );

				} //


				addPointer( event );

				if ( event.pointerType === 'touch' ) {

					onTouchStart( event );

				} else {

					onMouseDown( event );

				}

			}

			function onPointerMove( event ) {

				if ( scope.enabled === false ) return;

				if ( event.pointerType === 'touch' ) {

					onTouchMove( event );

				} else {

					onMouseMove( event );

				}

			}

			function onPointerUp( event ) {

				if ( scope.enabled === false ) return;

				if ( event.pointerType === 'touch' ) {

					onTouchEnd( event );

				} else {

					onMouseUp();

				} //


				removePointer( event );

				if ( _pointers.length === 0 ) {

					scope.domElement.releasePointerCapture( event.pointerId );
					scope.domElement.removeEventListener( 'pointermove', onPointerMove );
					scope.domElement.removeEventListener( 'pointerup', onPointerUp );

				}

			}

			function onPointerCancel( event ) {

				removePointer( event );

			}

			function keydown( event ) {

				if ( scope.enabled === false ) return;
				window.removeEventListener( 'keydown', keydown );

				if ( _keyState !== STATE.NONE ) {

					return;

				} else if ( event.code === scope.keys[ STATE.ROTATE ] && ! scope.noRotate ) {

					_keyState = STATE.ROTATE;

				} else if ( event.code === scope.keys[ STATE.ZOOM ] && ! scope.noZoom ) {

					_keyState = STATE.ZOOM;

				} else if ( event.code === scope.keys[ STATE.PAN ] && ! scope.noPan ) {

					_keyState = STATE.PAN;

				}

			}

			function keyup() {

				if ( scope.enabled === false ) return;
				_keyState = STATE.NONE;
				window.addEventListener( 'keydown', keydown );

			}

			function onMouseDown( event ) {

				if ( _state === STATE.NONE ) {

					switch ( event.button ) {

						case scope.mouseButtons.LEFT:
							_state = STATE.ROTATE;
							break;

						case scope.mouseButtons.MIDDLE:
							_state = STATE.ZOOM;
							break;

						case scope.mouseButtons.RIGHT:
							_state = STATE.PAN;
							break;

						default:
							_state = STATE.NONE;

					}

				}

				const state = _keyState !== STATE.NONE ? _keyState : _state;

				if ( state === STATE.ROTATE && ! scope.noRotate ) {

					_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

					_movePrev.copy( _moveCurr );

				} else if ( state === STATE.ZOOM && ! scope.noZoom ) {

					_zoomStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );

					_zoomEnd.copy( _zoomStart );

				} else if ( state === STATE.PAN && ! scope.noPan ) {

					_panStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );

					_panEnd.copy( _panStart );

				}

				scope.dispatchEvent( _startEvent );

			}

			function onMouseMove( event ) {

				const state = _keyState !== STATE.NONE ? _keyState : _state;

				if ( state === STATE.ROTATE && ! scope.noRotate ) {

					_movePrev.copy( _moveCurr );

					_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

				} else if ( state === STATE.ZOOM && ! scope.noZoom ) {

					_zoomEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

				} else if ( state === STATE.PAN && ! scope.noPan ) {

					_panEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

				}

			}

			function onMouseUp() {

				_state = STATE.NONE;
				scope.dispatchEvent( _endEvent );

			}

			function onMouseWheel( event ) {

				if ( scope.enabled === false ) return;
				if ( scope.noZoom === true ) return;
				event.preventDefault();

				switch ( event.deltaMode ) {

					case 2:
						// Zoom in pages
						_zoomStart.y -= event.deltaY * 0.025;
						break;

					case 1:
						// Zoom in lines
						_zoomStart.y -= event.deltaY * 0.01;
						break;

					default:
						// undefined, 0, assume pixels
						_zoomStart.y -= event.deltaY * 0.00025;
						break;

				}

				scope.dispatchEvent( _startEvent );
				scope.dispatchEvent( _endEvent );

			}

			function onTouchStart( event ) {

				trackPointer( event );

				switch ( _pointers.length ) {

					case 1:
						_state = STATE.TOUCH_ROTATE;

						_moveCurr.copy( getMouseOnCircle( _pointers[ 0 ].pageX, _pointers[ 0 ].pageY ) );

						_movePrev.copy( _moveCurr );

						break;

					default:
						// 2 or more
						_state = STATE.TOUCH_ZOOM_PAN;
						const dx = _pointers[ 0 ].pageX - _pointers[ 1 ].pageX;
						const dy = _pointers[ 0 ].pageY - _pointers[ 1 ].pageY;
						_touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );
						const x = ( _pointers[ 0 ].pageX + _pointers[ 1 ].pageX ) / 2;
						const y = ( _pointers[ 0 ].pageY + _pointers[ 1 ].pageY ) / 2;

						_panStart.copy( getMouseOnScreen( x, y ) );

						_panEnd.copy( _panStart );

						break;

				}

				scope.dispatchEvent( _startEvent );

			}

			function onTouchMove( event ) {

				trackPointer( event );

				switch ( _pointers.length ) {

					case 1:
						_movePrev.copy( _moveCurr );

						_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

						break;

					default:
						// 2 or more
						const position = getSecondPointerPosition( event );
						const dx = event.pageX - position.x;
						const dy = event.pageY - position.y;
						_touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );
						const x = ( event.pageX + position.x ) / 2;
						const y = ( event.pageY + position.y ) / 2;

						_panEnd.copy( getMouseOnScreen( x, y ) );

						break;

				}

			}

			function onTouchEnd( event ) {

				switch ( _pointers.length ) {

					case 0:
						_state = STATE.NONE;
						break;

					case 1:
						_state = STATE.TOUCH_ROTATE;

						_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

						_movePrev.copy( _moveCurr );

						break;

					case 2:
						_state = STATE.TOUCH_ZOOM_PAN;

						_moveCurr.copy( getMouseOnCircle( event.pageX - _movePrev.pageX, event.pageY - _movePrev.pageY ) );

						_movePrev.copy( _moveCurr );

						break;

				}

				scope.dispatchEvent( _endEvent );

			}

			function contextmenu( event ) {

				if ( scope.enabled === false ) return;
				event.preventDefault();

			}

			function addPointer( event ) {

				_pointers.push( event );

			}

			function removePointer( event ) {

				delete _pointerPositions[ event.pointerId ];

				for ( let i = 0; i < _pointers.length; i ++ ) {

					if ( _pointers[ i ].pointerId == event.pointerId ) {

						_pointers.splice( i, 1 );

						return;

					}

				}

			}

			function trackPointer( event ) {

				let position = _pointerPositions[ event.pointerId ];

				if ( position === undefined ) {

					position = new THREE.Vector2();
					_pointerPositions[ event.pointerId ] = position;

				}

				position.set( event.pageX, event.pageY );

			}

			function getSecondPointerPosition( event ) {

				const pointer = event.pointerId === _pointers[ 0 ].pointerId ? _pointers[ 1 ] : _pointers[ 0 ];
				return _pointerPositions[ pointer.pointerId ];

			}

			this.dispose = function () {

				scope.domElement.removeEventListener( 'contextmenu', contextmenu );
				scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
				scope.domElement.removeEventListener( 'pointercancel', onPointerCancel );
				scope.domElement.removeEventListener( 'wheel', onMouseWheel );
				scope.domElement.removeEventListener( 'pointermove', onPointerMove );
				scope.domElement.removeEventListener( 'pointerup', onPointerUp );
				window.removeEventListener( 'keydown', keydown );
				window.removeEventListener( 'keyup', keyup );

			};

			this.domElement.addEventListener( 'contextmenu', contextmenu );
			this.domElement.addEventListener( 'pointerdown', onPointerDown );
			this.domElement.addEventListener( 'pointercancel', onPointerCancel );
			this.domElement.addEventListener( 'wheel', onMouseWheel, {
				passive: false
			} );
			window.addEventListener( 'keydown', keydown );
			window.addEventListener( 'keyup', keyup );
			this.handleResize(); // force an update at start

			this.update();

		}

	}

	THREE.TrackballControls = TrackballControls;

} )();

/**
 * Based on http://www.emagix.net/academic/mscs-project/item/camera-sync-with-css3-and-webgl-threejs
 * @author mrdoob / http://mrdoob.com/
 */

 THREE.CSS3DObject = function ( element ) {

    THREE.Object3D.call( this );

    this.element = element;
    this.element.style.position = 'absolute';

    this.addEventListener( 'removed', function () {

        if ( this.element.parentNode !== null ) {

            this.element.parentNode.removeChild( this.element );

        }

    } );

};

THREE.CSS3DObject.prototype = Object.create( THREE.Object3D.prototype );
THREE.CSS3DObject.prototype.constructor = THREE.CSS3DObject;

THREE.CSS3DSprite = function ( element ) {

    THREE.CSS3DObject.call( this, element );

};

THREE.CSS3DSprite.prototype = Object.create( THREE.CSS3DObject.prototype );
THREE.CSS3DSprite.prototype.constructor = THREE.CSS3DSprite;

//

THREE.CSS3DRenderer = function () {

    console.log( 'THREE.CSS3DRenderer', THREE.REVISION );

    var _width, _height;
    var _widthHalf, _heightHalf;

    var matrix = new THREE.Matrix4();

    var cache = {
        camera: { fov: 0, style: '' },
        objects: {}
    };

    var domElement = document.createElement( 'div' );
    domElement.style.overflow = 'hidden';

    this.domElement = domElement;

    var cameraElement = document.createElement( 'div' );

    cameraElement.style.WebkitTransformStyle = 'preserve-3d';
    cameraElement.style.MozTransformStyle = 'preserve-3d';
    cameraElement.style.transformStyle = 'preserve-3d';

    domElement.appendChild( cameraElement );

    var isIE = /Trident/i.test( navigator.userAgent );

    this.getSize = function () {

        return {
            width: _width,
            height: _height
        };

    };

    this.setSize = function ( width, height ) {

        _width = width;
        _height = height;
        _widthHalf = _width / 2;
        _heightHalf = _height / 2;

        domElement.style.width = width + 'px';
        domElement.style.height = height + 'px';

        cameraElement.style.width = width + 'px';
        cameraElement.style.height = height + 'px';

    };

    function epsilon( value ) {

        return Math.abs( value ) < 1e-10 ? 0 : value;

    }

    function getCameraCSSMatrix( matrix ) {

        var elements = matrix.elements;

        return 'matrix3d(' +
            epsilon( elements[ 0 ] ) + ',' +
            epsilon( - elements[ 1 ] ) + ',' +
            epsilon( elements[ 2 ] ) + ',' +
            epsilon( elements[ 3 ] ) + ',' +
            epsilon( elements[ 4 ] ) + ',' +
            epsilon( - elements[ 5 ] ) + ',' +
            epsilon( elements[ 6 ] ) + ',' +
            epsilon( elements[ 7 ] ) + ',' +
            epsilon( elements[ 8 ] ) + ',' +
            epsilon( - elements[ 9 ] ) + ',' +
            epsilon( elements[ 10 ] ) + ',' +
            epsilon( elements[ 11 ] ) + ',' +
            epsilon( elements[ 12 ] ) + ',' +
            epsilon( - elements[ 13 ] ) + ',' +
            epsilon( elements[ 14 ] ) + ',' +
            epsilon( elements[ 15 ] ) +
            ')';

    }

    function getObjectCSSMatrix( matrix, cameraCSSMatrix ) {

        var elements = matrix.elements;
        var matrix3d = 'matrix3d(' +
            epsilon( elements[ 0 ] ) + ',' +
            epsilon( elements[ 1 ] ) + ',' +
            epsilon( elements[ 2 ] ) + ',' +
            epsilon( elements[ 3 ] ) + ',' +
            epsilon( - elements[ 4 ] ) + ',' +
            epsilon( - elements[ 5 ] ) + ',' +
            epsilon( - elements[ 6 ] ) + ',' +
            epsilon( - elements[ 7 ] ) + ',' +
            epsilon( elements[ 8 ] ) + ',' +
            epsilon( elements[ 9 ] ) + ',' +
            epsilon( elements[ 10 ] ) + ',' +
            epsilon( elements[ 11 ] ) + ',' +
            epsilon( elements[ 12 ] ) + ',' +
            epsilon( elements[ 13 ] ) + ',' +
            epsilon( elements[ 14 ] ) + ',' +
            epsilon( elements[ 15 ] ) +
            ')';

        if ( isIE ) {

            return 'translate(-50%,-50%)' +
                'translate(' + _widthHalf + 'px,' + _heightHalf + 'px)' +
                cameraCSSMatrix +
                matrix3d;

        }

        return 'translate(-50%,-50%)' + matrix3d;

    }

    function renderObject( object, camera, cameraCSSMatrix ) {

        if ( object instanceof THREE.CSS3DObject ) {

            var style;

            if ( object instanceof THREE.CSS3DSprite ) {

                // http://swiftcoder.wordpress.com/2008/11/25/constructing-a-billboard-matrix/

                matrix.copy( camera.matrixWorldInverse );
                matrix.transpose();
                matrix.copyPosition( object.matrixWorld );
                matrix.scale( object.scale );

                matrix.elements[ 3 ] = 0;
                matrix.elements[ 7 ] = 0;
                matrix.elements[ 11 ] = 0;
                matrix.elements[ 15 ] = 1;

                style = getObjectCSSMatrix( matrix, cameraCSSMatrix );

            } else {

                style = getObjectCSSMatrix( object.matrixWorld, cameraCSSMatrix );

            }

            var element = object.element;
            var cachedStyle = cache.objects[ object.id ] && cache.objects[ object.id ].style;

            if ( cachedStyle === undefined || cachedStyle !== style ) {

                element.style.WebkitTransform = style;
                element.style.MozTransform = style;
                element.style.transform = style;

                cache.objects[ object.id ] = { style: style };

                if ( isIE ) {

                    cache.objects[ object.id ].distanceToCameraSquared = getDistanceToSquared( camera, object );

                }

            }

            if ( element.parentNode !== cameraElement ) {

                cameraElement.appendChild( element );

            }

        }

        for ( var i = 0, l = object.children.length; i < l; i ++ ) {

            renderObject( object.children[ i ], camera, cameraCSSMatrix );

        }

    }

    var getDistanceToSquared = function () {

        var a = new THREE.Vector3();
        var b = new THREE.Vector3();

        return function ( object1, object2 ) {

            a.setFromMatrixPosition( object1.matrixWorld );
            b.setFromMatrixPosition( object2.matrixWorld );

            return a.distanceToSquared( b );

        };

    }();

    function zOrder( scene ) {

        var order = Object.keys( cache.objects ).sort( function ( a, b ) {

            return cache.objects[ a ].distanceToCameraSquared - cache.objects[ b ].distanceToCameraSquared;

        } );
        var zMax = order.length;

        scene.traverse( function ( object ) {

            var index = order.indexOf( object.id + '' );

            if ( index !== - 1 ) {

                object.element.style.zIndex = zMax - index;

            }

        } );

    }

    this.render = function ( scene, camera ) {

        var fov = camera.projectionMatrix.elements[ 5 ] * _heightHalf;

        if ( cache.camera.fov !== fov ) {

            domElement.style.WebkitPerspective = fov + 'px';
            domElement.style.MozPerspective = fov + 'px';
            domElement.style.perspective = fov + 'px';

            cache.camera.fov = fov;

        }

        scene.updateMatrixWorld();

        if ( camera.parent === null ) camera.updateMatrixWorld();

        var cameraCSSMatrix = 'translateZ(' + fov + 'px)' +
            getCameraCSSMatrix( camera.matrixWorldInverse );

        var style = cameraCSSMatrix +
            'translate(' + _widthHalf + 'px,' + _heightHalf + 'px)';

        if ( cache.camera.style !== style && ! isIE ) {

            cameraElement.style.WebkitTransform = style;
            cameraElement.style.MozTransform = style;
            cameraElement.style.transform = style;

            cache.camera.style = style;

        }

        renderObject( scene, camera, cameraCSSMatrix );

        if ( isIE ) {

            // IE10 and 11 does not support 'preserve-3d'.
            // Thus, z-order in 3D will not work.
            // We have to calc z-order manually and set CSS z-index for IE.
            // FYI: z-index can't handle object intersection
            zOrder( scene );

        }

    };

};

