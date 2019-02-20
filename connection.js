const Fabric_Client = require('fabric-client');

let fabric_client = null;
let channel = null;
let peers = [];
let orderer = null;


module.exports = (function () {
    return {
        init_fabric: function () {
            this.fabric_client = new Fabric_Client();
        },
        get_fabric: function () {
            return this.fabric_client;
        },
        set_channel: function (chnn) {
            this.channel = this.fabric_client.newChannel(chnn);
        },
        get_channel: function () {
            return this.channel;
        },
        set_peer: function (pr) {
            peers.push(this.fabric_client.newPeer(pr));
        },
        get_peer: function () {
            return peers
        },
        set_orderer: function (order) {
            this.orderer = this.fabric_client.newOrderer(order)
        },
        get_orderer: function () {
            return this.orderer
        },
        connect_peer: function () {
            this.channel.addPeer(peers[0]);
            this.channel.addPeer(peers[1]);
            this.channel.addPeer(peers[2]);
            this.channel.addPeer(peers[3]);
        },
        connect_orderer: function () {
            this.channel.addOrderer(this.orderer);
        }

    }
})();