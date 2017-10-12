/*
 * Copyright : Partnering 3.0 (2007-2016)
 * Author : Sylvain Mahé <sylvain.mahe@partnering.fr>
 *
 * This file is part of diya-sdk.
 *
 * diya-sdk is free software: you can redistribute it and/or modify

 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * diya-sdk is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with diya-sdk.  If not, see <http://www.gnu.org/licenses/>.
 */





/* maya-client
 * Copyright (c) 2014, Partnering Robotics, All rights reserved.
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; version
 *	3.0 of the License. This library is distributed in the hope
 * that it will be useful, but WITHOUT ANY WARRANTY; without even
 * the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE. See the GNU Lesser General Public License for more details.
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library.
 */

(function(){

	var DiyaSelector = d1.DiyaSelector;
	var util = require('util');
	var Watcher = require('./watcher.js');

	var debug = require('debug')('config');

	'use strict';


	//////////////////////////////////////////////////////////////
	/////////////////// Logging utility methods //////////////////
	//////////////////////////////////////////////////////////////

	/**
	 * Config API handler
	 */
	function Config(selector){
		var that = this;
		this.selector = selector;
		this.watchers = [];

		return this;
	};

	/**
	 * List all available keys
	 * @param {func} callback : called after update with params ({Array<String>} list, {Error} error)
	 */
	Config.prototype.list = function(callback){
		var that = this;
		console.warn("Config.list is deprecated. You are supposed to know what are the \
		configs available on the server (for instance 'board').");
		callback(null);
	};

	/**
	 * Set config for given key
	 * @param {String} key : key to which is associated the config value
	 * @param {Object} config : configuration to be stored
	 */
	Config.prototype.set = function(key,config){
		var that = this;
		let name = key.charAt(0).toUpperCase() + key.slice(1);
		let service = key;
		let serviceInterface = "fr.partnering." + name;
		let path = "/fr/partnering/" + name;
		let properties = Object.keys(config);

		/// TODO for each element in config set element
		let promises = [];
		properties.forEach( property => {
			promises.push(
				new Promise( (resolve,reject) => {
					this.selector.request({
						service: service,
						func: "Set",
						data: {
							interface_name: serviceInterface,
							property_name: property,
						},
						obj:{
							path: path,
							interface: "org.freedesktop.DBus.Properties",
						},
					}, (dnId, err, data) => {
						if( err != null) {
							debug(err);
							throw new Error(err);
						}
						debug(property, data);
						resolve()
					});
				})
			);
		})
			.then( successArray => {
				return new Promise( (resolve,reject) => {
					// TODO save when all promises are done
					this.selector.request({
						service: service,
						func: "Save",
						data: {},
						obj:{
							path: path,
							interface: service,
						},
					}, (dnId, err, data) => {
						if (err != null) {
							debug(err);
							throw new Error(err);
						}
						debug(data);
						debug("Set done");
						resolve()
					});
				});
			})
			.catch( error => {
				debug(error);
				console.warn("Config was not fully updated");
				throw new Error("IncompleteWrite");
			})

	};


	/**
	 * Update internal model with received data
	 * @param  key to select configuration to be watched
	 * @param  callback called on answers (@param : {Object} configuration )
	 */
	Config.prototype.watch = function(key, callback){
		var that = this;

		// do not create watcher without a callback
		if ( callback==null || typeof callback !== 'function') return null;

		let watcher = new Watcher(this.selector, {key: key});

		// add watcher in watcher list
		this.watchers.push(watcher);

		watcher.on('data', data => {
			callback(data);
		});
		watcher.on('stop', this._removeWatcher);

		return watcher;
	};

	/**
	 * Callback to remove watcher from list
	 * @param watcher to be removed
	 */
	Config.prototype._removeWatcher = function (watcher) {
		// find and remove watcher in list
		this.watchers.find( (el, id, watchers) => {
			if (watcher === el) {
				watchers.splice(id, 1); // remove
				return true;
			}
			return false;
		})
	};

	/**
	 * Stop all watchers
	 */
	Config.prototype.closeSubscriptions = function () {
		console.warn('Deprecated function use stopWatchers instead');
		this.stopWatchers();
	};
	Config.prototype.stopWatchers = function () {
		this.watchers.forEach( watcher => {
			// remove listener on stop event to avoid purging watchers twice
			watcher.removeListener('stop', this._removeWatcher);
			watcher.stop();
		});
		this.watchers =[];
	};



	/** create Config service **/
	DiyaSelector.prototype.Config = function(){
		return new Config(this);
	};

})()
