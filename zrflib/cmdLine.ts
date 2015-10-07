/// <reference path="../../DefinitelyTyped/node/node.d.ts"/>

import {zrfNodes as zrf, _emitSampleCompilerPass, _emitCompilerPassInterface} from "./zrfTypes";
import {zrfCompile} from "./zrfCompiler";
import {zrfPrettyPrint} from "./zrfUtils";
import {GraphNode, Player, Piece, Graph, Stack, Direction, PieceInfo, GameState} from "./stateTypes";
import {ZrfInterpreter, MoveList, MoveComponent, CompoundMove, doMove} from "./moveGenerator";
import {GameStateComponents, rulesCompile} from "./rulesCompiler";
import * as fs from "fs";

const asciiReps = ['p', 'n', 'b', 'r', 'q', 'k'];

export function playGame(filePath:string) {
    var zrfNode = zrfCompile(fs.readFileSync(filePath, "utf8"));

    var gameStateComp = rulesCompile(zrfNode.game, null);
    var {rules, pieceMoves, pieceDrops} = gameStateComp;

    console.log("WELCOME PLAY")

    var grid = rules.getGrids()[0];
    var {width, height} = grid;

    var gameState = rules.createGameState();
    let [white, black] = rules.getPlayers();
    let [pawn] = rules.getPieces();
    let cells = rules.cellList();
    
    let generator = new MoveGenerator(gameState, gameStateComp);

    let gameAi1 = makeGameAi(gameState, gameStateComp, evalBoard1, 6);
    let gameAi2 = makeGameAi(gameState, gameStateComp, evalBoard2, 6);
    
    function playMove() {
        let gameAi = (gameState.currentPlayer() === white) ? gameAi1 : gameAi2;
        printBoard(gameState)
        let move = gameAi.findMove();
        if (move) {
            doMove(gameState, move);
            console.log(move.serialize());
        }
    }

    return {gameState, gameStateComp, playMove}; // Addendum, hoisted helper functions below:
    function evalBoard1():number {
        let score = 0;
        for (let cell of cells) {
            if (gameState.hasPiece(cell)) {
                let worth = 200;
                let isWhite = gameState.getPieceOwner(cell) === white;
                let distanceToEnd = (isWhite ? cell.y : height - cell.y - 1);
                if (distanceToEnd === 0) {
                    worth += 10000;
                }
                worth -= distanceToEnd*distanceToEnd*10;
                score += (isWhite ? worth : -worth);
            }
            
        }
        return score;
    }

    function evalBoard2():number {
        let score = 0;
        for (let cell of cells) {
            if (gameState.hasPiece(cell)) {
                let worth = 200;
                let centerFactor = width - Math.abs(cell.x - width/2);
                worth += centerFactor * centerFactor; 
                let isWhite = gameState.getPieceOwner(cell) === white;
                let distanceToEnd = (isWhite ? cell.y : height - cell.y - 1);
                if (distanceToEnd === 0) {
                    worth += 10000;
                }
                worth -= distanceToEnd*distanceToEnd*10;
                score += (isWhite ? worth : -worth);
            }
            
        }
        return score;
    }
    
    function printBoard(gameState:GameState) {
        var {width, height} = gameState.gameStateDesc.getGrids()[0];
        let boardString = '';
        let white = gameState.gameStateDesc.getPlayers()[0];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let ind = y * width + x;
                let cell =  gameState.gameStateDesc.cellList()[ind];
                if (gameState.hasPiece(cell)) {
                    let char = asciiReps[gameState.getPiece(cell).enumId];
                    if (gameState.getPieceOwner(cell) !== white) {
                        char = char.toUpperCase();
                    }
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
        var {width, height} = gameState.gameStateDesc.getGrids()[0];
        let boardString = '';
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let ind = y * width + x;
                let cell = gameState.gameStateDesc.cellList()[ind];
                boardString += cell.id + ' ';
            }
            boardString += '\n';
        }
        console.log(boardString)
    }
}


class MoveGenerator {
    interpreter:ZrfInterpreter;
    player:Player;
    constructor(public gameState, public gameStateComp) {
        this.interpreter = new ZrfInterpreter(gameState, gameStateComp);
    }
    _setup(moves:MoveList, player:Player) {
        moves.clear();
        this.player = player;
    }
    generate(moves:MoveList, cell:GraphNode, statements:zrf.Statement[]) {
        this.interpreter.interpret(moves, cell, this.player, statements);
    }
    generateAll(moves:MoveList, player:Player) {
        this._setup(moves, player);
        for (let {owner, type, cell} of this.gameState.pieces()) {
            if (owner !== player) {
                continue;
            }
            for (let moveSequence of this.gameStateComp.pieceMoves.get(type)) {
                this.generate(moves, cell, moveSequence);
            }
        }
    }
}

function makeN<T>(n:number, callback:()=>T):T[] {
    let arr = [];
    while (n--) {
        arr.push(callback());
    }
    return arr;
}

function makeGameAi(gameState:GameState, gameStateComp:GameStateComponents, evalBoard:()=>number, maxSearchDepth:number) {
    let gameStateBuffers:GameState[] = makeN(maxSearchDepth, () => gameStateComp.rules.createGameState());
    let moveBuffers:MoveList[] = makeN(maxSearchDepth, () => new MoveList());
    let cells = gameState.gameStateDesc.cellList();
    let generator = new MoveGenerator(gameState, gameStateComp)
    let positivePlayer = gameState.currentPlayer(); // Arbitrary, used to determine sign of score

    let HUGE_SCORE = 10000;
    let aiObject = {eval, negamax, findMove, bestMove: <CompoundMove>null};
    function findMove():CompoundMove {
        aiObject.bestMove = null;
        negamax(0, maxSearchDepth, -HUGE_SCORE, HUGE_SCORE);
        return aiObject.bestMove && aiObject.bestMove.clone();
    }
    function negamax(draft:number, depth:number, alpha:number, beta:number):number {
        // Compute helper values:
        let player = gameState.currentPlayer();
        let sign = (player === positivePlayer ? 1 : -1);
        let moveList = moveBuffers[draft];
        let stateBuffer = gameStateBuffers[draft];
        let bestScore = -HUGE_SCORE;
        // Check depth:
        if (depth <= 0) {
            return evalBoard() * sign;
        }
        // Generate the moves:
        generator.generateAll(moveList, player);
        // Check no moves:
        if (moveList.length() === 0) {
            return evalBoard() * sign;
        }
        // Simulate the moves:
        for (let i = 0; i < moveList.length(); i++) {
            let move = moveList.get(i);
            gameState.copyTo(stateBuffer);
            doMove(gameState, move);
            let score = -negamax(draft +1, depth - 1, -beta, -alpha);
            stateBuffer.copyTo(gameState);
            bestScore = Math.max(score, bestScore);
            if (bestScore > alpha) {
                alpha = bestScore;
                if (draft === 0) {aiObject.bestMove = move};
            }
            if (bestScore > beta) {
                if (draft === 0) {aiObject.bestMove = move};
                return bestScore;
            }
        }
        return bestScore;
    }
    return aiObject;
}
