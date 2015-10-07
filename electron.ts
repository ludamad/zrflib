/// <reference path="../DefinitelyTyped/node/node.d.ts"/>

declare var __dirname:string;


var ipc = require("ipc");
var fs = require('fs');
var app = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');  // Module to create native browser window.

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null;

ipc.on('console.log', (event, arg) => {console.log(arg)});

// Quit when all windows are closed.
app.on('window-all-closed', () => app.quit());

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 1000, height: 600});

  // and load the index.html of the app.
  mainWindow.loadUrl(`file://${__dirname}/index.html`);

  // // Open the devtools.
   mainWindow.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
});
