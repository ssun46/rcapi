//SPDX-License-Identifier: Apache-2.0

// nodejs server setup 

// call the packages we need
var express = require('express');        // call express
var app = express();                 // define our app using express
var bodyParser = require('body-parser');
var http = require('http');
var server = http.createServer().listen(4000);
var io = require('socket.io').listen(server);
var terminal    = require("web-terminal");

io.sockets.on('connection', function (socket) {

    socket.join("front");

    //Send this event to everyone in the room.
    socket.on('send_message', function (message) {
        console.log("server #######################")
        socket.in("front").emit('message', message);
    });
})

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

// terminal(app);
// console.log("web-terminal start!!!")