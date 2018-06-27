#node-red-contrib-ua-avk-websockets
A web-socket with Login & Password authentication support.

##Install
Run the following command in the root directory of your Node-RED install

npm install node-red-contrib-ua-avk-websockets

##UnInstall
Run the following command in the root directory of your Node-RED install

npm uninstall node-red-contrib-ua-avk-websockets


##Usage
Edit the websockets node with your Domain value above in the config panel.

##Connect
```
msg.cred = {
    "path": "host",
    "username": "login",
    "password": "password",
    "protocol":"server-protocol",
}

```