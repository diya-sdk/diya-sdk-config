const EventEmitter = require('eventemitter3');
const debug = require('debug')('config:watcher');
const debugError = require('debug')('config:watcher:errors');

// import Promise
let Promise = null;
if (window != null) {
	Promise = window.Promise;
} else {
	Promise = require('bluebird');
}

'use strict';

class StopCondition extends Error {
	constructor(msg) {
		super(msg);
		this.name='StopCondition'
	}
}


class Watcher extends EventEmitter {
	/**
	 * @param emit emit data (mandatory)
	 * @param config to get data from server
	 */
	constructor (selector, _config) {
		super();

		this.selector = selector;
		this.state = 'running';

		this.reconnectionPeriod = 0; // initial period between reconnections
		this.maxReconnectionPeriod = 300000; // max 5 min

		let name = _config.key.charAt(0).toUpperCase() + _config.key.slice(1);
		let options = {
			service: _config.key,
			interface: "fr.partnering." + name,
			path: "/fr/partnering/" + name,
		};
		this.options = options;
		debug(options);

		this.watch(options); // start watcher
	}

	watch (options) {
		debug('in watch');
		let data = null;
		new Promise( (resolve, reject) => {
			// Request history data before subscribing
			this.selector.request({
				service: options.service,
				func: "GetAll",
				data: {
					interface_name: options.interface
				},
				obj:{
					path: options.path,
					interface: "org.freedesktop.DBus.Properties",
				},
			}, (dnId, err, output) => {
				if (err != null)  {
					reject(err);
					return;
				}
				if (this.state === 'stopped') {
					reject(new StopCondition());
				}
				data = this._formatToJSObject(output);
				debug('Request:emitData');
				debug(data);
				this.emit('data', data);
				resolve();
			});
		})
			.then( _ => {
				// subscribe to signal
				debug('Subscribing');
				return new Promise ( (resolve, reject) =>  {
					this.subscription = this.selector.subscribe({
						service: options.service,
						func: "PropertiesChanged",
						obj:{
							path: options.path,
							interface: "org.freedesktop.DBus.Properties",
						}
					}, (dnd, err, output) => {
						debug(output);
						if (err != null) {
							reject(err);
							return;
						}
						debug('Signal:emitData');
						let updatedConfig = this._formatToJSObject(output[1]);
						let itemNames = Object.keys(updatedConfig);
						itemNames.forEach( itemName => {
							data[itemName] = updatedConfig[itemName];
						})
						debug(data);
						let invalidatedConfig = this._formatToJSObject(output[2]);
						itemNames = Object.keys(invalidatedConfig);
						itemNames.forEach( itemName => {
							data[itemName] = undefined;
						})
						this.emit('data', data);

						this.reconnectionPeriod=0; // reset period on subscription requests
						resolve();
					})
				})
			})
			.catch( err => {
				if (err.name === 'StopCondition') { // watcher stopped : do nothing
					return;
				}
				// try to restart later
				debugError(err);
				this._closeSubscription(); // should not be necessary
				this.reconnectionPeriod = this.reconnectionPeriod+1000; // increase delay by 1 sec
				if (this.reconnectionPeriod > this.maxReconnectionPeriod) {
					this.reconnectionPeriod=this.maxReconnectionPeriod; // max 5min
				}
				this.watchTentative = setTimeout( _ => {
					this.watch(options);
				}, this.reconnectionPeriod); // try again later
			});

	}

	// Close subscription if any
	_closeSubscription () {
		debug('In closeSubscription');
		if (this.subscription != null) {
			this.subscription.close();
			this.subscription = null;
		}
	}

	/**
	 * Format input object so that properties are camelCase (standard for JS)
	 * On DBUS services, properties must be capitalized. This conversion should
	 * improve readability for apps allers
	 * @param input from dbus service
	 * @return output with capitalized properties
	 */
	_formatToJSObject (input) {
		let output = {};
		Object.keys(input).forEach( property => {
			let jsProperty = property.charAt(0).toLowerCase() + property.slice(1);
			output[jsProperty] = input[property];
		});
		return output;
	}


	stop () {
		debug('In stop');
		this.state = 'stopped';
		if (this.watchTentative != null) {
			clearTimeout(this.watchTentative);
		}
		this._closeSubscription();
		this.emit('stop');
		this.removeAllListeners();
	}
}

module.exports = Watcher;
