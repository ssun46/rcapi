//SPDX-License-Identifier: Apache-2.0

// nodejs server setup 

// call the packages we need
var express = require('express');        // call express
var app = express();                 // define our app using express
var bodyParser = require('body-parser');
var http = require('http');
var server = http.createServer().listen(4000);
var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket) {

    socket.join("front");

    //Send this event to everyone in the room.
    socket.on('send_message', function (message) {
        console.log("server #######################")
        socket.in("front").emit('message', message);
    });

});

// server_check
var http2 = require('http');
var server_check = http2.createServer().listen(5050);
var check_io = require('socket.io').listen(server_check);
var io_client = require('socket.io-client');

////////////////////// node monitor
check_io.sockets.on('connection', function (socket) {

    socket.join("server");

    //Send this event to everyone in the room.
    socket.on('server_status', function (server_status) {
        socket.in("server").emit('server_status', server_status);
    });
});

var socket_conn = function (avail) {
    // socket////////////////////////////////////////////////////////
    // console.log("in the socket block #####################################")
    // console.log(avail);
    var socket_client = io_client.connect('127.0.0.1:5050');
    socket_client['io']['opts'] = {
        'hostname': "127.0.0.1",
        'path': "/socket.io",
        'port': "5050",
        'secure': false
    }
    socket_client['nsp'] = "/";
    socket_client['io']['uri'] = "http://127.0.0.1:5050";
    socket_client['io']['engine']['hostname'] = '127.0.0.1';
    socket_client['io']['engine']['port'] = '5050';
    socket_client.on('connect', function () {
        // console.log("connect");
    });
    //event emit
    socket_client.emit('server_status', avail, function (data) { });
    //////////////////////////////////////////////////////////////
}

//net-ping
var tcpp = require('tcp-ping');
var cron = require('node-cron');

cron.schedule('* * * * * *', () => {
    var peer_cfg1 = {
        address: 'localhost',
        port: '7051'
    }

    tcpp.probe('localhost', 7051, function (err, avail) {
        // if( !avail ){
            var message = {
                "status" : avail,
                "peer" : peer_cfg1.port
            }
            socket_conn(message);
            // console.log(avail);
        // }
    });
    tcpp.ping(peer_cfg1, function (err, data) {
        // console.log(data);
    });

    var peer_cfg2 = {
        address: 'localhost',
        port: '8051'
    }

    tcpp.probe('localhost', 8051, function (err, avail) {
        // if( !avail ){
            var message = {
                "status" : avail,
                "peer" : peer_cfg2.port
            }
            socket_conn(message);
            // console.log(avail);
        // }
        
    });
    tcpp.ping(peer_cfg2, function (err, data) {
        // console.log(data);
    });

});

// Load all of our middleware
// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// instantiate the app
var app = express();

// this line requires and runs the code from our routes.js file and passes it app
require('./routes.js')(app);

// Save our port
var port = process.env.PORT || 3000;

// Start the server and listen on port 
app.listen(port, function () {
    console.log("Live on port: " + port);
});