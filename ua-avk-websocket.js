/**
 * @author Kononenko Aleksandr
 *
 * @param RED
 */
module.exports = function(RED) {
    "use strict";
    var ws = require("ws");
    var url1;
    var username;
    var password;
    var protocol;


    // A node red node that sets up a local websocket server
    function UaAVKWebSocketClientNode(n) {
        // Create a RED node
        RED.nodes.createNode(this, n);
        var node = this;
        node.msg_callbacks = [];
        node._inputNodes = []; // collection of nodes that want to receive events
        node._clients = {};
        // match absolute url
        node.closing = false;
        node.logged = false;

        node.setMaxListeners(100);

        node.pinger = setInterval(function() {
            //only ping if connected and working
            if (node.logged) {
                node.ping();
            }
        }, 5000);

        node.closing = false;

        function startconn() { // Connect to remote endpoint
            var id = (1 + Math.random() * 4294967295).toString(16);
            var protocols = new Array;
            protocols[0]= protocol;
            var path = "wss://" + username + ":" + password + "@" + url1;

            //should not start connection if no server auth data
            node.logged = false;
            var socket = protocols[0]!==null ? new ws(path, protocols) : new ws(path);
            node.server = socket; // keep for closing
            socket.setMaxListeners(100);

            socket.on('open', function() {
                node.emit('opened', '');
            });

            socket.on('close', function() {
                //node.log(RED._("Connection closed: ") + path);
                node.emit('closed');
                node.logged = false;
                if (!node.closing) {
                    clearTimeout(node.tout);
                    node.tout = setTimeout(function() {
                        startconn();
                    }, 5000); // try to reconnect every 5 secs... bit fast ?
                }
            });

            socket.on('message', function(data, flags) {
                //node.warn(RED._("DATA:") + JSON.stringify(data) );
                node.handleEvent(id, socket, 'message', data, flags);
            });

            socket.on('error', function(err) {
                node.error(RED._("Socket error: ") + err);
                node.emit('erro');
                node.logged = false;
                if (!node.closing) {
                    clearTimeout(node.tout);
                    node.tout = setTimeout(function() {
                        startconn();
                    }, 5000); // try to reconnect every 5 secs... bit fast ?
                }
            });
        }

        node.on("close", function() {
            // Remove listeners from RED.server
            node.closing = true;
            node.logged = false;
            node.server.close();
            if (node.tout) {
                clearTimeout(node.tout);
            }
        });


        startconn(); // start outbound connection

    }
    RED.nodes.registerType("ua-avk-websockets-client", UaAVKWebSocketClientNode);


    UaAVKWebSocketClientNode.prototype.registerInputNode = function( /*Node*/ handler) {
        this.log(RED._("Register input node"));
        this._inputNodes.push(handler);
    };

    UaAVKWebSocketClientNode.prototype.removeInputNode = function( /*Node*/ handler) {
        this.log(RED._("Remove input node"));
        this._inputNodes.forEach(function(node, i, inputNodes) {
            if (node === handler) {
                inputNodes.splice(i, 1);
            }
        });
    };

    UaAVKWebSocketClientNode.prototype.ping = function() {
        this.server.send('');

    };

    UaAVKWebSocketClientNode.prototype.handleEvent = function(id, /*socket*/socket, /*String*/event, /*Object*/data, /*Object*/flags) {
        var msg;
        if (this.wholemsg) {
            try {
                msg = JSON.parse(data);
            } catch(err) {
                msg = {
                    payload : data
                };
            }
        } else {
            msg = {
                payload : data
            };
        }
        msg._session = {
            type : "ws-in",
            id : id
        };
        for (var i = 0; i < this._inputNodes.length; i++) {
            this._inputNodes[i].send(msg);
        }
    };

    UaAVKWebSocketClientNode.prototype.send_msg = function(message) {
        this.server.send(message);
    };


    function UaAVKWebSocketInReadNode(n) {
        RED.nodes.createNode(this, n);
        this.server = (n.client) ? n.client : n.server;
        var node = this;
        this.serverConfig = RED.nodes.getNode(this.server);

        this.nodeType = 'read';

        if (this.serverConfig) {
            this.serverConfig.registerInputNode(this);
            // TODO: nls
            this.serverConfig.on('opened', function(n) {
                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: "connecting " + n
                });
            });
            this.serverConfig.on('connected', function(n) {
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "connected " + n
                });
            });
            this.serverConfig.on('erro', function() {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "error"
                });
            });
            this.serverConfig.on('closed', function() {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "disconnected"
                });
            });
        } else {
            this.error(RED._("websocket.errors.missing-conf"));
        }

        this.on('close', function() {
            node.serverConfig.removeInputNode(node);
        });

    }
    RED.nodes.registerType("ua-avk-websockets-in", UaAVKWebSocketInReadNode);



    function UaAVKWebSocketOutWriteNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        var nodePath = n.path;
        this.server = n.client;

        this.serverConfig = RED.nodes.getNode(this.server);
        if (!this.serverConfig) {
            this.error(RED._("websocket.errors.missing-conf"));
        } else {
            // TODO: nls
            this.serverConfig.on('opened', function(n) {
                node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: "connecting " + n
                });
            });
            this.serverConfig.on('connected', function(n) {
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "connected " + n
                });
            });
            this.serverConfig.on('erro', function() {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "error"
                });
            });
            this.serverConfig.on('closed', function() {
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "disconnected"
                });
            });
        }

        this.on("input", function (msg) {
            node.status({
                fill: "blue",
                shape: "dot",
                text: "httpin.status.requesting"
            });

            var url = nodePath || msg.cred.path;
            if (msg.cred.path && nodePath && (nodePath !== msg.cred.path)) { // revert change below when warning is finally removed
                node.warn(RED._("common.errors.nooverride"));
            }
            if (!url) {
                node.error(RED._("httpin.errors.no-url"), msg);
                node.emit('erro');
                return;
            }

            url1 = msg.cred.path;
            username = msg.cred.username;
            password = msg.cred.password;
            protocol = msg.cred.protocol;


            if (msg.hasOwnProperty("payload") && node.serverConfig && node.serverConfig.logged) {
                var payload = Buffer.isBuffer(msg.payload) ? msg.payload : RED.util.ensureString(msg.payload);
                var subject = msg.topic ? msg.topic : payload;
                this.serverConfig.send_msg(subject);

            } else {
                this.serverConfig.send_msg(JSON.stringify(msg.payload));

            }

        });

    }
    RED.nodes.registerType("ua-avk-websockets-out", UaAVKWebSocketOutWriteNode);



};
