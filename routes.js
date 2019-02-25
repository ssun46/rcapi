//SPDX-License-Identifier: Apache-2.0
var rc_coin = require('./controller.js');
var con = require('./connection.js');

let fabric = null;
let evt_glob = [];

con.init_fabric();
con.set_channel('channelrc');
con.set_peer('grpc://127.0.0.1:7051');
// con.set_peer('grpc://127.0.0.1:8051');
// con.set_peer('grpc://210.107.78.167:9051');
// con.set_peer('grpc://210.107.78.167:10051');
con.set_orderer('grpc://127.0.0.1:7050');
con.connect_peer();
con.connect_orderer();
var peers = con.get_peer();
evt_glob.push(con.get_channel().newChannelEventHub(peers[0]));
// evt_glob.push(con.get_channel().newChannelEventHub(peers[1]));
// evt_glob.push(con.get_channel().newChannelEventHub(peers[2]));
// evt_glob.push(con.get_channel().newChannelEventHub(peers[3]));
fabric = con;

// evt_glob = con.get_channel().newChannelEventHub(con.get_peer());

module.exports = function (app, io) {
  // cors  
  app.all('/*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
  });
  // init_wallet
  app.post('/init_wallet', function (req, res) {
    rc_coin.init_wallet(req, res, fabric, evt_glob);
  });
  // publish
  app.post('/publish', function (req, res) {
    rc_coin.publish(req, res, fabric, evt_glob);
  });
  // transfer
  app.post('/transfer', function (req, res) {
    rc_coin.transfer(req, res, fabric, evt_glob);
  });
  // get_account
  app.get('/get_account', function (req, res) {
    console.log("##############################")
    rc_coin.get_account(req, res, fabric);
  });
  // get_txList
  app.get('/get_txList/', function (req, res) {
    rc_coin.get_txList(req, res, fabric);
  });
  // get_tx_cnt
  app.get('/get_tx_cnt/', function (req, res) {
    rc_coin.get_tx_cnt(req, res, fabric);
  });
  // get_total_publish
  app.get('/get_total_publish/', function (req, res) {
    rc_coin.get_total_publish(req, res, fabric);
  });
  // get_default_block
  app.get('/get_default_block/', function (req, res) {
    rc_coin.get_default_block(req, res, fabric);
  });
  // get_each_block_info
  app.get('/get_block_info/', function (req, res) {
    rc_coin.get_block_info(req, res, fabric);
  });
  // server restart
  app.get('/node_restart/', function (req, res) {
    rc_coin.node_restart(req, res, fabric);
  });
}
