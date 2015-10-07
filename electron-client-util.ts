/// <reference path="../DefinitelyTyped/node/node.d.ts" />

var util = require("util");
var ipc = require("ipc");
console.log = function() {
    let message = util.format.apply(this, arguments)
    ipc.send("console.log", message);
};

export var __dummy = 0; // Make us a module TODO add real stuff