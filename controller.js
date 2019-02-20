var Fabric_Client = require('fabric-client');
var path = require('path');
var util = require('util');
var os = require('os');
var io = require('socket.io-client');
var exec = require("child_process").exec;

var last_block = 0;

var socket_conn = function (blocks) {
	// socket////////////////////////////////////////////////////////
	console.log("in the socket block #####################################")
	console.log(blocks);
	var socket = io.connect('210.107.78.166:4000');
	socket['io']['opts'] = {
		'hostname': "210.107.78.166",
		'path': "/socket.io",
		'port': "4000",
		'secure': false
	}
	socket['nsp'] = "/";
	socket['io']['uri'] = "http://210.107.78.166:4000";
	socket['io']['engine']['hostname'] = '210.107.78.166';
	socket['io']['engine']['port'] = '4000';
	socket.on('connect', function () {
		console.log("connect");
	});
	//event emit
	socket.emit('send_message', blocks, function (data) { });
	//////////////////////////////////////////////////////////////
}

var block_listener = function (channel, event_hub) {
	console.log("block listener ####################################################");
	let blockPromise = new Promise((resolve, reject) => {
		let handle = setTimeout(() => {
			event_hub.unregisterBlockEvent(1);
			event_hub.disconnect();
			resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
		}, 3000);
		event_hub.registerBlockEvent((block) => {
			console.log("in the block event ############################################");
			// this is the callback for transaction event status
			// first some clean up of event listener
			clearTimeout(handle);

			var code = block['filtered_transactions'][0]['tx_validation_code'];
			var tx_id = block['filtered_transactions'][0]['txid'];
			var block_number = block['number'];
			last_block = block_number;
			var peer_name = event_hub['_peer']['_name'];
			// now let the application know what happened
			var return_status = { peer_name: peer_name, tx_id: tx_id, num: block_number };
			if (code !== 'VALID') {
				console.error('The block has not been created = ' + code);
				resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
			} else {
				console.log('The block has been created on channel ');
				resolve(return_status);
			}
		}, (err) => {
			//this is the callback if something goes wrong with the event registration or processing
			reject(new Error('There was a problem with the eventhub ::' + err));
		},
			{ disconnect: true } //disconnect when complete
		);
		event_hub.connect();

	});
	return blockPromise;
}

var tx_listener = function (channel, peer, event_hub, tx_id) {
	console.log("tx listener ####################################################");
	let txPromise = new Promise((resolve, reject) => {
		let handle = setTimeout(() => {
			event_hub.unregisterTxEvent(tx_id);
			event_hub.disconnect();
			resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
		}, 3000);
		event_hub.registerTxEvent('all', (tx, code) => {
			// this is the callback for transaction event status
			// first some clean up of event listener
			clearTimeout(handle);

			// now let the application know what happened
			var return_status = { event_status: code, tx_id: tx_id };
			if (code !== 'VALID') {
				console.error('The transaction was invalid, code = ' + code);
				resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
			} else {
				console.log('The transaction has been committed on peer ' + event_hub.getPeerAddr());
				resolve(return_status);
			}
		}, (err) => {
			//this is the callback if something goes wrong with the event registration or processing
			reject(new Error('There was a problem with the eventhub ::' + err));
		},
			{ disconnect: true } //disconnect when complete
		);
		event_hub.connect();

	});
	return txPromise;
}

module.exports = (function () {
	return {
		init_wallet: function (req, res, fabric_client, evt) {
			console.log("init_wallet ###################################################")
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data)
			///////////////////////////////////////////////
			const data = req.query
			const param_userId = data.user_id
			const param_fromId = data.from_id
			const param_date = data.date
			console.log("###################################################")
			console.log(param_userId + ":" + param_fromId + ":" + param_date)
			console.log("###################################################")

			const channel = fabric_client.get_channel();
			const peer = fabric_client.get_peer();
			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};
			let block_evt_list = [];
			result_of_tx['userId'] = param_userId;
			result_of_tx['fromId'] = param_fromId;
			result_of_tx['date'] = param_date;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				console.log("after set key path ##################################")
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				console.log("after get user ##################################")
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get admin.... run registerAdmin.js');
				}

				// get a transaction id object based on the current user assigned to fabric client
				tx_id = fabric_client.fabric_client.newTransactionID();
				console.log("Assigning transaction_id: ", tx_id._transaction_id);

				/////////////////////////////////////////////////////////////////////////////
				//                                  init_wallet
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					chaincodeId: 'rc_cc',
					fcn: 'init_wallet',
					args: [param_userId, param_fromId, param_date],
					chainId: 'channelrc',
					txId: tx_id
				};

				// send the transaction proposal to the peers
				return channel.sendTransactionProposal(request);
			}).then((results) => {
				console.log("after proposal ##########################################")
				var proposalResponses = results[0];
				var proposal = results[1];
				console.log(proposal)
				let isProposalGood = false;
				if (proposalResponses && proposalResponses[0].response &&
					proposalResponses[0].response.status === 200) {
					isProposalGood = true;
					console.log('Transaction proposal was good');
				} else {
					console.error('Transaction proposal was bad');
					result_of_tx['message'] = proposalResponses[0].response;
				}
				if (isProposalGood) {
					console.log(util.format(
						'Successfully sent Proposal and received ProposalResponse: Status - %s, payload - "%s", proposal - "%s"',
						proposalResponses[0].response.status, proposalResponses[0].response.payload, proposal));

					// result for final response
					// result_of_tx = proposalResponses[0].response.payload

					// build up the request for the orderer to have the transaction committed
					var request = {
						proposalResponses: proposalResponses,
						proposal: proposal
					};

					var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
					var promises = [];

					var sendPromise = channel.sendTransaction(request);
					promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

					// get an eventhub once the fabric client has a user assigned. The user
					// is required bacause the event registration must be signed

					// event listeners
					let txPromise = tx_listener(channel, peer, evt[0], transaction_id_string);

					promises.push(txPromise);

					return Promise.all(promises);
				} else {
					result_of_tx['result'] = 'fail'
					res.json(result_of_tx);
					console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
					throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
				}
			}).then((results) => {
				var blockPromise = [];
				if (results) {
					for (var i = 0; i < evt.length; i++) {
						console.log("blockpromise #######################################")
						blockPromise[i] = block_listener(channel, evt[i]);
						blockPromise[i].then((result) => {
							console.log(result)
							block_evt_list.push(result);
						});
					}
				}
				return Promise.all(blockPromise);
			}).then((results) => {
				// socket emit
				console.log("block then results #############################")
				console.log(block_evt_list.length)
				socket_conn(block_evt_list);
				console.log('Send transaction promise and event listener promise have completed');
				result_of_tx['result'] = 'success'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length));
				res.json(result_of_tx)
			}).catch((err) => {
				// socket_conn(block_evt_list);
				const peer_list = [
					"210.107.78.166:7051",
					"210.107.78.166:8051",
					"210.107.78.167:9051",
					"210.107.78.167:10051"
				]
				var regex = "/ChannelEventHub has been shutdown/g";
				var err_string = err.toString();
				if (err_string.search(regex)) {
					var block_evt_list_last = [];
					var success_evt_peers_block = parseInt(block_evt_list[0]['num'], 10);
					// console.log(success_evt_peers_block)
					// console.log(success_evt_peers_name)
					// console.log(evt)
					var failed_evt_peers_name = "";
					for (var i = 0; i < peer_list.length; i++) {
						// if (success_evt_peers_name != evt[i]['_peer']['_name']) {
						console.log("peer_list: " + peer_list[i]);
						failed_evt_peers_name = peer_list[i];
						var block_num = parseInt(last_block);
						var is_block = channel.queryBlock(block_num, failed_evt_peers_name).then((result) => {
							console.log("failed_evt_peers_name: " + failed_evt_peers_name)
							block_evt_list_last.push({
								peer_name: peer_list[i],
								tx_id: result['data']['data'][0]['payload']['header']['channel_header']['tx_id'],
								num: result['header']['number']
							})
							// socket_conn([{
							// 	peer_name: failed_evt_peers_name,
							// 	tx_id: result['data']['data'][0]['payload']['header']['channel_header']['tx_id'],
							// 	num: result['header']['number']
							// }]);
							// console.log(failed_evt_peers_name)
							// console.log(result['data']['data'][0]['payload']['header']['channel_header']['tx_id']);
							
						});
						// }
					}

					for( var i=0; i<block_evt_list_last.length; i++ ){
						block_evt_list_last[i]['peer_name'] = peer_list[i];
						console.log(peer_list)
					}
					socket_conn(block_evt_list_last);

				} else {
					console.error('Failed to invoke :: ' + err);
				}
				result_of_tx['result'] = 'fail'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length))
				res.send(result_of_tx);
			});

		},
		publish: function (req, res, fabric_client, evt) {
			console.log("publish ###################################################")
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data)
			///////////////////////////////////////////////
			const data = req.query
			const param_userId = data.user_id
			const param_fromId = data.from_id
			const param_amount = data.amount
			const param_date = data.date
			console.log("###################################################")
			console.log(param_userId + ":" + param_fromId + ":" + param_amount + ":" + param_date)
			console.log("###################################################")

			const channel = fabric_client.get_channel();
			const peer = fabric_client.get_peer();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};
			let block_evt_list = [];
			result_of_tx['userId'] = param_userId;
			result_of_tx['fromId'] = param_fromId;
			result_of_tx['amount'] = param_amount;
			result_of_tx['date'] = param_date;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get admin.... run registerAdmin.js');
				}

				// get a transaction id object based on the current user assigned to fabric client
				tx_id = fabric_client.fabric_client.newTransactionID();
				console.log("Assigning transaction_id: ", tx_id._transaction_id);

				/////////////////////////////////////////////////////////////////////////////
				//                                  publish
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					chaincodeId: 'rc_cc',
					fcn: 'publish',
					args: [param_userId, param_fromId, param_amount, param_date],
					chainId: 'channelrc',
					txId: tx_id
				};

				// send the transaction proposal to the peers
				return channel.sendTransactionProposal(request);
			}).then((results) => {
				console.log("after proposal ##########################################")
				var proposalResponses = results[0];
				var proposal = results[1];
				console.log(proposal)
				let isProposalGood = false;
				if (proposalResponses && proposalResponses[0].response &&
					proposalResponses[0].response.status === 200) {
					isProposalGood = true;
					console.log('Transaction proposal was good');
				} else {
					console.error('Transaction proposal was bad');
					result_of_tx['message'] = proposalResponses[0].response;
				}
				if (isProposalGood) {
					console.log(util.format(
						'Successfully sent Proposal and received ProposalResponse: Status - %s, payload - "%s", proposal - "%s"',
						proposalResponses[0].response.status, proposalResponses[0].response.payload, proposal));

					// result for final response
					// result_of_tx = proposalResponses[0].response.payload

					// build up the request for the orderer to have the transaction committed
					var request = {
						proposalResponses: proposalResponses,
						proposal: proposal
					};

					var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
					var promises = [];

					var sendPromise = channel.sendTransaction(request);
					promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

					// get an eventhub once the fabric client has a user assigned. The user
					// is required bacause the event registration must be signed

					// event listeners
					let txPromise = tx_listener(channel, peer, evt[0], transaction_id_string);

					promises.push(txPromise);

					return Promise.all(promises);
				} else {
					result_of_tx['result'] = 'fail'
					res.json(result_of_tx);
					console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
					throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
				}
			}).then((results) => {
				var blockPromise = [];
				if (results) {
					for (var i = 0; i < evt.length; i++) {
						console.log("blockpromise #######################################")
						blockPromise[i] = block_listener(channel, evt[i]);
						blockPromise[i].then((result) => {
							console.log(result)
							block_evt_list.push(result);
						});
					}
				}
				return Promise.all(blockPromise);
			}).then((results) => {
				// socket emit
				console.log("block then results #############################")
				console.log(block_evt_list.length)
				socket_conn(block_evt_list);
				console.log('Send transaction promise and event listener promise have completed');
				result_of_tx['result'] = 'success'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length));
				res.json(result_of_tx)
			}).catch((err) => {
				socket_conn(block_evt_list);
				var regex = "/ChannelEventHub has been shutdown/g";
				var err_string = err.toString();
				if (err_string.search(regex)) {
					var success_evt_peers_block = parseInt(block_evt_list[0]['num'], 10);
					var success_evt_peers_name = block_evt_list[0]['peer_name'];
					// console.log(success_evt_peers_block)
					// console.log(success_evt_peers_name)
					// console.log(evt)
					var block_evt_list_last = [];
					for (var i = 0; i < evt.length; i++) {
						if (success_evt_peers_name != evt[i]['_peer']['_name']) {
							var failed_evt_peers_name = evt[i]['_peer']['_name'];
							var is_block = channel.queryBlock(success_evt_peers_block, failed_evt_peers_name).then((result) => {

								block_evt_list_last.push({
									peer_name: failed_evt_peers_name,
									tx_id: result['data']['data'][0]['payload']['header']['channel_header']['tx_id'],
									num: result['header']['number']
								})
								console.log(failed_evt_peers_name)
								console.log(result['data']['data'][0]['payload']['header']['channel_header']['tx_id']);
								
							});
						}
					}
					socket_conn(block_evt_list_last);
				} else {
					console.error('Failed to invoke :: ' + err);
				}
				result_of_tx['result'] = 'fail'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length))
				res.send(result_of_tx);
			});

		},
		transfer: function (req, res, fabric_client, evt) {
			console.log("transfer ###################################################")
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data)
			///////////////////////////////////////////////
			const data = req.query
			const param_fromId = data.from_id
			const param_toId = data.to_id
			const param_amount = data.amount
			const param_type = data.type
			const param_date = data.date

			console.log("trnansfer##########################################")
			console.log(param_fromId + ":" + param_toId + ":" + param_amount + ":" + param_type + ":" + param_date)
			console.log("###################################################")

			const channel = fabric_client.get_channel();
			const peer = fabric_client.get_peer();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};
			let block_evt_list = [];
			result_of_tx['fromId'] = param_fromId;
			result_of_tx['toId'] = param_toId;
			result_of_tx['amount'] = param_amount;
			result_of_tx['type'] = param_type;
			result_of_tx['date'] = param_date;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get admin.... run registerAdmin.js');
				}

				// get a transaction id object based on the current user assigned to fabric client
				tx_id = fabric_client.fabric_client.newTransactionID();
				console.log("Assigning transaction_id: ", tx_id._transaction_id);

				/////////////////////////////////////////////////////////////////////////////
				//                                  transfer
				// '{"Args":["transfer", "yang", "lee", "10", "1", "2"]}'
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					chaincodeId: 'rc_cc',
					fcn: 'transfer',
					args: [param_fromId, param_toId, param_amount, param_type, param_date],
					chainId: 'channelrc',
					txId: tx_id
				};
				console.log("tx_id############################################")
				console.log(tx_id['_transaction_id'])
				console.log(tx_id)
				// send the transaction proposal to the peers
				return channel.sendTransactionProposal(request);
			}).then((results) => {
				console.log("after proposal ##########################################")
				var proposalResponses = results[0];
				var proposal = results[1];
				console.log(proposal)
				let isProposalGood = false;
				if (proposalResponses && proposalResponses[0].response &&
					proposalResponses[0].response.status === 200) {
					isProposalGood = true;
					console.log('Transaction proposal was good');
				} else {
					console.error('Transaction proposal was bad');
					result_of_tx['message'] = proposalResponses[0].response;
				}
				if (isProposalGood) {
					console.log(util.format(
						'Successfully sent Proposal and received ProposalResponse: Status - %s, payload - "%s", proposal - "%s"',
						proposalResponses[0].response.status, proposalResponses[0].response.payload, proposal));

					// result for final response
					// result_of_tx = proposalResponses[0].response.payload

					// build up the request for the orderer to have the transaction committed
					var request = {
						proposalResponses: proposalResponses,
						proposal: proposal
					};

					var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
					var promises = [];

					var sendPromise = channel.sendTransaction(request);
					promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

					// get an eventhub once the fabric client has a user assigned. The user
					// is required bacause the event registration must be signed

					// event listeners
					let txPromise = tx_listener(channel, peer, evt[0], transaction_id_string);

					promises.push(txPromise);

					return Promise.all(promises);
				} else {
					result_of_tx['result'] = 'fail'
					res.json(result_of_tx);
					console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
					throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
				}
			}).then((results) => {
				var blockPromise = [];
				if (results) {
					for (var i = 0; i < evt.length; i++) {
						console.log("blockpromise #######################################")
						blockPromise[i] = block_listener(channel, evt[i]);
						blockPromise[i].then((result) => {
							console.log(result)
							block_evt_list.push(result);
						});
					}
				}
				return Promise.all(blockPromise);
			}).then((results) => {
				// socket emit
				console.log("block then results #############################")
				console.log(block_evt_list.length)
				socket_conn(block_evt_list);
				console.log('Send transaction promise and event listener promise have completed');
				result_of_tx['result'] = 'success'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length));
				res.json(result_of_tx)
			}).catch((err) => {
				socket_conn(block_evt_list);
				var regex = "/ChannelEventHub has been shutdown/g";
				var err_string = err.toString();
				if (err_string.search(regex)) {
					var success_evt_peers_block = parseInt(block_evt_list[0]['num'], 10);
					var success_evt_peers_name = block_evt_list[0]['peer_name'];
					// console.log(success_evt_peers_block)
					// console.log(success_evt_peers_name)
					// console.log(evt)
					var block_evt_list_last = [];
					for (var i = 0; i < evt.length; i++) {
						if (success_evt_peers_name != evt[i]['_peer']['_name']) {
							var failed_evt_peers_name = evt[i]['_peer']['_name'];
							var is_block = channel.queryBlock(success_evt_peers_block, failed_evt_peers_name).then((result) => {

								block_evt_list_last.push({
									peer_name: failed_evt_peers_name,
									tx_id: result['data']['data'][0]['payload']['header']['channel_header']['tx_id'],
									num: result['header']['number']
								})
								socket_conn(block_evt_list_last);
								console.log(failed_evt_peers_name)
								console.log(result['data']['data'][0]['payload']['header']['channel_header']['tx_id']);

							});
						}
					}
					console.log("true#################");
				} else {
					console.error('Failed to invoke :: ' + err);
				}
				result_of_tx['result'] = 'fail'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length))
				res.send(result_of_tx);
			});

		},
		get_account: function (req, res, fabric_client) {
			console.log("get_account ###################################################")
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data)
			///////////////////////////////////////////////
			const data = req.query
			const param_userId = data.user_id

			console.log("get_account########################################")
			console.log(param_userId)
			console.log("###################################################")

			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};
			result_of_tx['userId'] = param_userId;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get admin.... run registerAdmin.js');
				}

				/////////////////////////////////////////////////////////////////////////////
				//                                  get_account
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					//targets : --- letting this default to the peers assigned to the channel
					chaincodeId: 'rc_cc',
					fcn: 'get_account',
					args: [param_userId],
					chainId: 'channelrc',
					txId: tx_id
				};

				// send the query proposal to the peer
				return channel.queryByChaincode(request);
			}).then((query_responses) => {
				console.log("#####################################");
				console.log("response for query###################");
				console.log(query_responses[1].toString())
				console.log("#####################################");
				// query_responses could have more than one  results if there multiple peers were used as targets
				if (query_responses) {
					if (query_responses[0] instanceof Error) {
						console.error("error from query = ", query_responses[0].toString());
						result_of_tx['result'] = 'fail'
						result_of_tx['message'] = query_responses[0].message;
						res.json(result_of_tx);
					} else {
						console.log("Response is ", query_responses[0].toString());
						result_of_tx['result'] = 'success'
						result_of_tx['value'] = query_responses[0].toString();
						res.json(result_of_tx);
					}
				} else {
					console.log("No payloads were returned from query");
				}
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_of_tx['message'] = err;
				result_of_tx['result'] = 'fail'
				res.json(result_of_tx)
			});
		},
		get_txList: function (req, res, fabric_client) {
			console.log("get_txList ###################################################")
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data)
			///////////////////////////////////////////////
			const data = req.query
			const param_userId = data.user_id

			console.log("get_txList###################################################")
			console.log(param_userId)
			console.log("###################################################")

			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};
			result_of_tx['userId'] = param_userId;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerAdmin.js');
				}

				/////////////////////////////////////////////////////////////////////////////
				//                                  get_txList
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					//targets : --- letting this default to the peers assigned to the channel
					chaincodeId: 'rc_cc',
					fcn: 'get_txList',
					args: [param_userId],
					chainId: 'channelrc',
					txId: tx_id
				};

				// send the query proposal to the peer
				return channel.queryByChaincode(request);
			}).then((query_responses) => {
				console.log("Query has completed, checking results");
				// query_responses could have more than one  results if there multiple peers were used as targets
				if (query_responses) {
					if (query_responses[0] instanceof Error) {
						console.error("error from query = ", query_responses[0].toString());
						result_of_tx['result'] = 'fail';
						result_of_tx['message'] = query_responses[0].message;
						res.json(result_of_tx);
					} else {
						let json_string = JSON.parse(query_responses[0].toString());
						let result_list = [];

						for (let i = 0; i < json_string.length; i++) {
							console.log(json_string[i]['txId']);

							let result_map = {
								'tx_id': json_string[i]['txId'],
								'balance': json_string[i]['value']['balance'],
								'trader': json_string[i]['value']['TxInfo']['trader'],
								'amount': json_string[i]['value']['TxInfo']['amount'],
								'txType': json_string[i]['value']['TxInfo']['txType'],
								'date': json_string[i]['value']['TxInfo']['date']
							};
							result_list.push(result_map)
						}

						console.log("Response is ", result_list);
						result_of_tx['result'] = 'success';
						result_of_tx['value'] = query_responses[0].toString();

						res.json(result_list);
					}
				} else {
					console.log("No payloads were returned from query");
				}
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_of_tx['message'] = err;
				result_of_tx['result'] = 'fail'
				res.json(result_of_tx)
			});
		},
		get_tx_cnt: function (req, res, fabric_client) {
			console.log("get_tx_cnt###################################################")

			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var result_of_tx = {};

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerAdmin.js');
				}

				return channel.queryInfo();
			}).then((response) => {
				console.log("Query has completed, checking results");
				// query_responses could have more than one  results if there multiple peers were used as targets
				if (response) {
					console.log("################### block height");
					result_of_tx['result'] = 'success';
					result_of_tx['block_height'] = response['height']['low'];
					console.log(response['height']['low']);
					res.json(result_of_tx);
				} else {
					console.log("No payloads were returned from query");
				}
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_of_tx['message'] = err;
				result_of_tx['result'] = 'fail'
				res.json(result_of_tx);
			});
		},
		get_total_publish: function (req, res, fabric_client) {
			console.log("get_total_publish ###################################################");

			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerAdmin.js');
				}

				/////////////////////////////////////////////////////////////////////////////
				//                                  get_txList
				/////////////////////////////////////////////////////////////////////////////
				var request = {
					//targets : --- letting this default to the peers assigned to the channel
					chaincodeId: 'rc_cc',
					fcn: 'get_txList',
					args: ['admin'],
					chainId: 'channelrc',
					txId: tx_id
				};

				// send the query proposal to the peer
				return channel.queryByChaincode(request);
			}).then((query_responses) => {
				console.log("Query has completed, checking results");
				// query_responses could have more than one  results if there multiple peers were used as targets
				if (query_responses) {
					if (query_responses[0] instanceof Error) {
						console.error("error from query = ", query_responses[0].toString());
						result_of_tx['result'] = 'fail';
						result_of_tx['message'] = query_responses[0].message;
						res.json(result_of_tx);
					} else {
						let json_string = JSON.parse(query_responses[0].toString());
						let result_list = [];

						for (let i = 1; i < json_string.length; i++) {
							console.log(json_string[i]['txId']);

							let result_map = {
								'tx_id': json_string[i]['txId'],
								'balance': json_string[i]['value']['balance'],
								'trader': json_string[i]['value']['TxInfo']['trader'],
								'amount': json_string[i]['value']['TxInfo']['amount'],
								'txType': json_string[i]['value']['TxInfo']['txType'],
								'date': json_string[i]['value']['TxInfo']['date']
							};
							result_list.push(result_map)
						}

						console.log("Response is ", result_list);
						result_of_tx['result'] = 'success';
						result_of_tx['value'] = query_responses[0].toString();

						res.json(result_list);
					}
				} else {
					console.log("No payloads were returned from query");
				}
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_of_tx['message'] = err;
				result_of_tx['result'] = 'fail'
				res.json(result_of_tx)
			});
		},
		get_default_block: function (req, res, fabric_client) {

			const peer_list = [
				"210.107.78.166:7051",
				"210.107.78.166:8051",
				"210.107.78.167:9051",
				"210.107.78.167:10051"
			]
			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var result_list = [];

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerAdmin.js');
				}
				var block_num = parseInt(last_block);
				var block_list = [];
				for (var i = 0; i < peer_list.length; i++) {
					block_list[i] = channel.queryBlock(block_num, peer_list[i]).then((result) => {
						return result;
					});
				}
				return Promise.all(block_list);
			}).then((result) => {
				for (var i = 0; i < result.length; i++) {
					result_list.push({
						peer_name: peer_list[i],
						tx_id: result[i]['data']['data'][0]['payload']['header']['channel_header']['tx_id'],
						num: result[i]['header']['number'],
						ip: peer_list[i].substr(0, peer_list[i].indexOf(":")),
						port: peer_list[i].substr(peer_list[i].indexOf(":")+1),
						index: i+1
					})
				}
				res.json(result_list);
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_list.push({
					message: err,
					result: "fail"
				})
				res.json(result_list);
			});
		},
		get_block_info: function (req, res, fabric_client) {
			console.log("get_block_info ###################################################");
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data);
			///////////////////////////////////////////////
			const data = req.query;
			console.log(data)
			const block_num = parseInt(data.block_num, 10);
			const target = data.target;
			const channel = fabric_client.get_channel();

			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerAdmin.js');
				}
				return channel.queryBlock(block_num, target);
			}).then((query_responses) => {
				console.log("Query has completed, checking results");
				// query_responses could have more than one  results if there multiple peers were used as targets
				if (query_responses) {
					if (query_responses[0] instanceof Error) {
						console.error("error from query = ", query_responses[0]);
						result_of_tx['result'] = 'fail';
						result_of_tx['message'] = query_responses[0].message;
						res.json(result_of_tx);
					} else {
						let json_string = query_responses;
						let result_map = {
							'timestamp': json_string['data']['data'][0]['payload']['header']['channel_header']['timestamp'],
							'number': json_string['header']['number'],
							'previous_hash': json_string['header']['previous_hash'],
							'data_hash': json_string['header']['data_hash'],
							'mspid': json_string['data']['data'][0]['payload']['data']['actions'][0]['header']['creator']['Mspid'],
						};

						console.log("Response is ", result_map);
						result_of_tx['result'] = 'success';
						result_of_tx['value'] = query_responses[0];
						result_of_tx['block_info'] = result_map;

						res.json(result_of_tx);
					}
				} else {
					console.log("No payloads were returned from query");
				}
			}).catch((err) => {
				console.error('Failed to query successfully :: ' + err);
				result_of_tx['message'] = err;
				result_of_tx['result'] = 'fail'
				res.json(result_of_tx)
			});
		},
		node_restart: function (req, res, fabric_client) {
			console.log("node restart ###################################################");
			///////////////////////////////////////////////
			// const data = JSON.parse(req.query.param_data);
			///////////////////////////////////////////////
			const channel = fabric_client.get_channel();
			const peer = fabric_client.get_peer();
			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;
			var result_of_tx = {};

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				console.log("after set key path ##################################")
				// assign the store to the fabric client
				fabric_client.fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.fabric_client.getUserContext('admin', true);
			}).then((user_from_store) => {
				console.log("after get user ##################################")
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded admin from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get admin.... run registerAdmin.js');
				}

				// get a transaction id object based on the current user assigned to fabric client
				tx_id = fabric_client.fabric_client.newTransactionID();
				console.log("Assigning transaction_id: ", tx_id._transaction_id);

				let g_request = {
					txId: tx_id
				};

				// get the genesis block from the orderer
				channel.getGenesisBlock(g_request).then((block) => {
					genesis_block = block;
					tx_id = fabric_client.fabric_client.newTransactionID();
					let j_request = {
						targets: ['localhost:7051'],
						block: genesis_block,
						txId: {
							// signer_or_userContext: 
							// {
							// 	role: {
							// 		name: "admin", 
							// 		mspId: "Admin"
							// 	},
							// 	OrganizationUnit: ,
							// 	Identity: 
							// },
							admin: true
						}
					};

					console.log(JSON.stringify(j_request))

					// send genesis block to the peer
					return channel.joinChannel(j_request);
				}).then((results) => {
					if (results && results.response && results.response.status == 200) {
						console.log('Joined correctly')
					} else {
						console.log('Failed', results)
					}
				});
			}).then((results) => {
				// socket emit
				console.log('Send transaction promise and event listener promise have completed');
				result_of_tx['result'] = 'success'
				console.log(result_of_tx.toString('utf8', 0, result_of_tx.length));
				res.json(result_of_tx)
			})

			// console.log(data.peer);
			// console.log(data.chaincode);

			// var peer = data.peer;
			// var chaincode = data.chaincode; 
			// var cmd = "docker start " + peer + " " + chaincode;

			// exec(cmd, function(err, stdout, stderr){
			// 	console.log("err");
			// 	console.log(err);
			// 	console.log("stdout");
			// 	console.log(stdout);
			// 	console.log("stderr");
			// 	console.log(stderr);
			// 	if( !err ){
			// 		var cmd_child = "docker ps -a";
			// 		exec(cmd_child, function(err, stdout, stderr){
			// 			res.send(stdout);
			// 		});
			// 	}
			// });
		},
	}
})();