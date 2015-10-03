/// <reference path="../DefinitelyTyped/node/node.d.ts"/>

import {zrfNodes as zrf, _emitSampleCompilerPass, _emitCompilerPassInterface} from "./zrfTypes";
import {zrfCompile} from "./zrfCompiler";
import {zrfPrettyPrint} from "./zrfUtils";
import {GraphNode, Player, Piece, Graph, Stack, Direction, PieceInfo, GameState} from "./stateTypes";
import {ZrfInterpreter, MoveBuffer, Move} from "./moveGenerator";
import {rulesCompile} from "./rulesCompiler";
import * as fs from "fs";

var zrfNode = zrfCompile(fs.readFileSync(process.argv[2], "utf8"));

var gameStateComp = rulesCompile(zrfNode.game);
var {rules, pieceMoves, pieceDrops} = gameStateComp;

console.log("WELCOME PLAY")

var grid = rules.grids()[0];
var {width, height} = grid;

var gameState = rules.createGameState();
let [white, black] = rules.getPlayers();
let [pawn] = rules.getPieces();
let cells = rules.cellList();

function printBoard(gameState:GameState) {
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

function printBoardCoords(gameState:GameState) {
    let boardString = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let ind = y * width + x;
            let cell = rules.cellList()[ind];
            boardString += cell.id + ' ';
        }
        boardString += '\n';
    }
    console.log(boardString)
}

class GameInstance {
    interpreter:ZrfInterpreter;
    moveBuffer = new MoveBuffer();
    constructor(game, gameStateComp) {
        this.interpreter = new ZrfInterpreter(game, gameStateComp);
    }
    interpret(cell:GraphNode, player:Player, statements:zrf.Statement[]):Move[] {
        this.moveBuffer.clear();
        this.interpreter.interpret(this.moveBuffer, cell, player, statements);
        this.moveBuffer.print();
        return this.moveBuffer.getMoves();
    }
}

let instance = new GameInstance(gameState, gameStateComp);

function doMove(gameState:GameState, cell:GraphNode, player:Player, statements:zrf.Statement[]) {
    for (let {owner, type, x, y} of gameState.pieces()) {
        for (let moveSequence of pieceMoves.get(type)) {
            console.log(owner, type, x, y)
            let moves = instance.interpret(cell, player, statements);
        }
    }
}
doMove(gameState, rules.getCell("c2"), white, pieceMoves.get(pawn)[0])
printBoard(gameState);
printBoardCoords(gameState);
