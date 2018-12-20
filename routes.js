//SPDX-License-Identifier: Apache-2.0


var rc_coin = require('./controller.js');

module.exports = function(app){
  app.get('/init_wallet', function(req, res) {
    console.log("#################");
    rc_coin.init_wallet(req, res);
  });
}
