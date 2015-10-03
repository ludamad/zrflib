/// <reference path="../DefinitelyTyped/node/node.d.ts"/>

import {zrfNodes, _emitSampleCompilerPass, _emitCompilerPassInterface} from "./zrfTypes";
import {zrfCompile} from "./zrfCompiler";
import {zrfPrettyPrint} from "./zrfUtils";
import {rulesCompile} from "./rulesCompiler";
import * as fs from "fs";

var zrf = zrfCompile(fs.readFileSync(process.argv[2], "utf8"));

var {rules, playerMoves, playerDrops} = rulesCompile(zrf.game);

console.log("WELCOME PLAY")

var grid = rules.grids()[0];
var {width, height} = grid;

var gameState = rules.createGameState();
let [white, black] = rules.getPlayers();

function printBoard() {
    let boardString = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let ind = y * width + x;
            let cell = rules.cellList()[ind];
            if (gameState.hasPiece(cell)) {
                let char = gameState.getPieceOwner(cell) === white ? 'X' : 'O';
                boardString += char + ' ';
            } else {
                boardString += '- ';
            }
        }
        boardString += '\n';
    }
    console.log(boardString)
}

printBoard()
