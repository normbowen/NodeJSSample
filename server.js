var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var redis = require('redis');
var port = process.env.VCAP_APP_PORT || 3000;

var redisClient;

if (process.env.VCAP_SERVICES) {
    var conf = JSON.parse(process.env.VCAP_SERVICES);
    var config = {};

    config.redis = {};

    if (process.env.VCAP_SERVICES) {
        console.log("get redis config")
        conf = JSON.parse(process.env.VCAP_SERVICES);
        config.redis.host = conf['redis'][0].credentials.host;
        console.log(config.redis.host);
        config.redis.port = conf['redis'][0].credentials.port;
        console.log(config.redis.port);
        config.redis.pass = conf['redis'][0].credentials.password; //note you have to have a password and pass it after instantiation
        console.log("end redis config)");
    }
    redisClient = require("redis").createClient(config.redis.port, config.redis.host);
    redisClient.auth(config.redis.pass);
}
else
{
    redisClient = require("redis").createClient();
}
    var storeMessage = function (name, data) {
        var message = JSON.stringify({ name: name, data: data });

        redisClient.lpush("messages", message, function (err, response) {
            redisClient.ltrim("messages", 0, 9)
        });
    }

    app.get('/', function (req, res) {
        res.sendFile(__dirname+ '/index.html');
    });

    io.on('connection', function (client) {
        console.log("Client connected...");

        client.on('join', function (name) {
            client.nickname = name;
            client.broadcast.emit('chat message', name + ' has joined.');
            client.emit('chat message', 'welcome ' + name);
            redisClient.sadd("users", client.nickname);            
            redisClient.lrange("messages", 0, -1, function(err, messages)
                {
                messages = messages.reverse();
                
                    messages.forEach(function (message) {
                        message = JSON.parse(message);
                        client.emit('chat message', message.name + ': ' + message.data);
                    });
                
                });

            });

        client.on('chat message', function (msg) {
            io.emit('chat message', client.nickname + ":" + msg);
            storeMessage(client.nickname, msg);
        });

        client.on('disconnect', function (name) {
            client.broadcast.emit("remove user", client.nickname + "has left.");
            console.log("removing user:", client.nickname);
            if (client.nickname) {
                redisClient.srem("users", client.nickname);
            }
        });

    });

    http.listen(port, function () {
        console.log('listening on *:'+port);
    });
