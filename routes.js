//SPDX-License-Identifier: Apache-2.0


var rc_coin = require('./controller.js');

module.exports = function(app){
  
  app.all('/*', function (req, res, next) {
  	res.header("Access-Control-Allow-Origin", "*");
   	res.header("Access-Control-Allow-Headers", "X-Requested-With");
   	next();
  });
  // init_wallet
  app.post('/init_wallet/:user_id/:from_id/:date', function(req, res) {
    rc_coin.init_wallet(req, res);
  });
  // publish
  app.post('/publish/:user_id/:from_id/:amount/:date', function(req, res) {
    rc_coin.publish(req, res);
  });
  // transfer
  app.post('/transfer/:from_id/:to_id/:amount/:type/:date', function(req, res) {
    rc_coin.transfer(req, res);
  });
  // get_account
  app.get('/get_account/:user_id', function(req, res) {
    rc_coin.get_account(req, res);
  });
  // get_txList
  app.get('/get_txList/:user_id', function(req, res) {
    rc_coin.get_txList(req, res);
  });
  // get_tx_cnt
  app.get('/get_tx_cnt/', function(req, res) {
    rc_coin.get_tx_cnt(req, res);
  });
  // get_total_publish
  app.get('/get_total_publish/', function(req, res) {
    rc_coin.get_total_publish(req, res);
  });
}
