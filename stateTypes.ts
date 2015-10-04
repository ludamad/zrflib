// Boarders public API for hosted Javascript games.
//
// API Version: 0.0.?
//
// This code should be usable anywhere, but only games hosted on the server can be played through the Boarders server.
// Networking primitives are decidedly not to ever be exposed. The fact that the code is so tied to the Boarders server 
// should not be evident during local testing.
//
// Current goals are to provide a convenient framework for Chesslikes. 
//
// Playing areas should be represented as graphs, but so far the plan is onlyto 
// provide rendering support for square grids. 
//
// Similarly, logic can be anything, but current display support is limited to 
// one image per square.
//
// Stretch goals:
// Maybe provide JSFiddle-like environment eventually.

"use strict";

import {arrayCopy, arrayCopyTo, arrayWithValueNTimes, mapUntilN, mapNByM, unionToArray, Enumerable, Enumerator} from "./common/common";

export abstract class StateComponent extends Enumerable {
    constructor(public gameStateDesc:GameStateDescriptor) {
        super();
    }
}

// Tentatively the following is the 'BRF object model', 
// which the ZRF object model is compiled to,
// and which the Boarders API emits. (Architecture is hard)

// This is user facing code, use getters and underscored members:
export class GraphNode extends StateComponent {
    constructor(gameStateDesc:GameStateDescriptor, public id:string, public parent:Graph, public x:number, public y:number) {
        super(gameStateDesc);
        gameStateDesc.enums.graphNodes.add(this)
    }

    public next(dir:Direction): GraphNode {
        var nextEnumId = dir._next[this.enumId];
        if (nextEnumId == null) return null;
        return this.gameStateDesc.enums.getGraphNode(nextEnumId);
    }
    public prev(dir:Direction): GraphNode {
        var prevEnumId = dir._next[this.enumId];
        if (prevEnumId == null) return null;
        return this.gameStateDesc.enums.getGraphNode(prevEnumId);
    }
}

export class Attribute extends StateComponent {
    constructor(gameStateDesc:GameStateDescriptor,  public piece:Piece, public id:string, public defaultVal:boolean, enumId:number) {
        super(gameStateDesc);
        this.enumId = enumId;
    }
}

// This is user facing code, use getters and underscored members:
export abstract class Graph extends StateComponent {
    constructor(gameStateDesc:GameStateDescriptor) {
        super(gameStateDesc);
        gameStateDesc.enums.graphs.add(this);
    }
    public cellList(): GraphNode[] {
        throw new Error("Abstract method called!");
    }  
    public getById(id:string):GraphNode {
        throw new Error("Abstract method called!");
    }
}

export class Stack extends StateComponent {
    _pieceId:number;
    _playerId:number;
    getPiece() : Piece {
        return this.gameStateDesc.enums.getPiece(this._pieceId);
    }
    constructor(gameStateDesc:GameStateDescriptor, public id:string, player:Player, piece:Piece) {
        super(gameStateDesc);
        this._pieceId = piece.enumId;
        gameStateDesc.enums.stacks.add(this);
    }
}

export class Direction extends StateComponent {
    _symmetry:Direction[] = [];
    constructor(public gameStateDesc:GameStateDescriptor, public _prev : number[], public _next:number[]) {
        super(gameStateDesc);
        gameStateDesc.enums.directions.add(this);
    }
    setSymmetry(player:Player, dir:Direction) {
        while (this._symmetry.length <= player.enumId) {
            this._symmetry.push(this);
        }
        this._symmetry[player.enumId] = dir;
    }
    getSymmetry(player:Player) {
        if (this._symmetry.length <= player.enumId) {
            return this;
        }
        return this._symmetry[player.enumId];
    }
    next(node:GraphNode):GraphNode {
        let id = this._next[node.enumId];
        if (id === -1) return null;
        return this.gameStateDesc.enums.getGraphNode(id);
    }
    prev(node:GraphNode) {
        let id = this._prev[node.enumId];
        if (id === -1) return null;
        return this.gameStateDesc.enums.getGraphNode(id);
    }
}

// This is user facing code, use getters and underscored members:
export class Grid extends Graph {
    // The cells of the graph, mirrored by HtmlCell's in the UI
    _cells : GraphNode[][];
    image : string;

    constructor(gameStateDesc:GameStateDescriptor, public width, public height, cellIds) {
        super(gameStateDesc);
        this._cells = mapNByM(width, height, (x, y) => 
            new GraphNode(gameStateDesc, cellIds(x, y), this, x, y)
        );
    }
    public setImage(image:string) {
        this.image = image;
    }

    public direction(dx:number, dy:number):Direction {
        var prevCellGrid = mapNByM(this.width, this.height, (x, y) => {
            var prevCell = this.getByXY(x - dx, y - dy);
            return prevCell ? prevCell.enumId : null;
        });
        var nextCellGrid = mapNByM(this.width, this.height, (x, y) => {
            var nextCell = this.getByXY(x + dx, y + dy);
            return nextCell ? nextCell.enumId : null;
        });
        return new Direction(this.gameStateDesc, [].concat(...prevCellGrid), [].concat(...nextCellGrid));
    }

    public cellList():GraphNode[] {
        var list = [];
        for (var row of this._cells) {
            for (var cell of row) {
                list.push(cell);
            }
        }
        return list;
    }

    public getByXY(x:number, y:number):GraphNode {
        if (this._cells[y] == null) {
            return null;
        }
        return this._cells[y][x];
    }

    public getById(id:string):GraphNode {
        for (var row of this._cells) {
            for (var cell of row) {
                if (cell.id === id) {
                    return cell;
                }
            }
        }
        return null;
    }
}

// This is user facing code, use getters and underscored members:
export class Player extends StateComponent {
    constructor(gameStateDesc:GameStateDescriptor, public id:string) {
        super(gameStateDesc);
        gameStateDesc.enums.players.add(this);
    }
}

// This is user facing code, use getters and underscored members:
export class Piece extends StateComponent {
    images = {};
    attributes = [];
    startingAttributes:number = 0;
    public attribute(id:string, defaultVal:boolean) {
        let attribute = new Attribute(this.gameStateDesc, this, id, defaultVal, this.attributes.length);
        if (defaultVal) {
            this.startingAttributes |= (1 << this.attributes.length);
        }
        this.attributes.push(attribute);
        return attribute;
    }
    constructor(gameStateDesc:GameStateDescriptor, public id:string) {
        super(gameStateDesc);
        gameStateDesc.enums.pieces.add(this);
    }

    public setImage(players:Player|Player[], img?): void{
        for (var p of unionToArray(players)) {
            this.images[p.id] = img;
        }
    }
}

export interface PieceInfo {
    owner: Player;
    type: Piece;
    cell: GraphNode;
}

// This is user facing code, use getters and underscored members:
export class GameState {
    _currentPlayerNum:number = 0;

    constructor(public gameStateDesc:GameStateDescriptor, 
        public _enumOwners:number[]      = [],
        public _enumPieces:number[]      = [],
        public _enumAttributes:number[]      = [],
        public _enumStackAmounts:number[]= []) {
    }

    public copyTo(g:GameState) {
        arrayCopyTo(this._enumOwners, g._enumOwners);
        arrayCopyTo(this._enumPieces, g._enumPieces);
        arrayCopyTo(this._enumStackAmounts, g._enumStackAmounts);
        arrayCopyTo(this._enumAttributes, g._enumAttributes);
        g._currentPlayerNum = this._currentPlayerNum;
    }

    public currentPlayer():Player {
        return this.gameStateDesc.enums.getPlayer(this._currentPlayerNum);
    }
    
    public setPieceAttribute(cell:GraphNode, attribute:Attribute, value:boolean):void {
        let mask = 1 << attribute.enumId;
        if (value) {
            this._enumAttributes[cell.enumId] |= mask;
        } else {
            this._enumAttributes[cell.enumId] &= ~mask;
        }
    }
    public setStackAmount(stack:Stack, amount:number):void {
        this._enumStackAmounts[stack.enumId] = amount;
    }
    public getStackAmount(stack:Stack):number {
        return this._enumStackAmounts[stack.enumId];
    }
    public setPiece(cell:GraphNode, player:Player, piece:Piece):void {
        this._enumOwners[cell.enumId] = player.enumId;
        this._enumPieces[cell.enumId] = piece.enumId;
        this._enumAttributes[cell.enumId] = piece.startingAttributes;
    }

    public clearPiece(cell:GraphNode):void {
        this._enumOwners[cell.enumId] = -1;
        this._enumPieces[cell.enumId] = -1;
        this._enumAttributes[cell.enumId] = 0;
    }

    public hasPieceAttribute(cell:GraphNode, attribute:Attribute):boolean {
        return (this._enumAttributes[cell.enumId] & (1 << attribute.enumId)) !== 0;
    }
    public getPieceOwner(cell:GraphNode):Player {
        return this.gameStateDesc.enums.getPlayer(this._enumOwners[cell.enumId]);
    }

    public hasPiece(cell) {
        return this.getPiece(cell) != null;
    }

    public getPiece(cell:GraphNode):Piece {
        var eId = this._enumPieces[cell.enumId];
        if (eId === -1) {
            return null;
        }
        return this.gameStateDesc.enums.getPiece(eId);
    }

    public movePiece(cell1:GraphNode, cell2:GraphNode) {
        this._enumOwners[cell2.enumId] = this._enumOwners[cell1.enumId];
        this._enumPieces[cell2.enumId] = this._enumPieces[cell1.enumId];
        this._enumAttributes[cell2.enumId] = this._enumAttributes[cell1.enumId];
        this._enumOwners[cell1.enumId] = -1;
        this._enumPieces[cell1.enumId] = -1;
        this._enumAttributes[cell1.enumId] = 0;
    }

    public pieces():PieceInfo[] {
        var pieces:PieceInfo[] = [];
        for (var i = 0; i < this._enumOwners.length; i++) {
            var owner = this.gameStateDesc.enums.getPlayer(this._enumOwners[i]);
            var typeEnum = this._enumPieces[i];
            if (typeEnum !== -1) {
                var cell = this.gameStateDesc.cellList()[i];
                pieces.push({owner, type: this.gameStateDesc.enums.getPiece(typeEnum), cell});
            }
        }
        return pieces;
    }

    public endTurn():void {
        this._currentPlayerNum = (this._currentPlayerNum+1) % this.gameStateDesc.enums.players.total();
    }
}

export class Enumerators {
    graphs = new Enumerator<Graph>();
    directions = new Enumerator<Direction>();
    graphNodes = new Enumerator<GraphNode>();
    stacks = new Enumerator<Stack>();
    players = new Enumerator<Player>();
    pieces = new Enumerator<Piece>();
    attributes = new Enumerator<Attribute>();

    getGraph(enumId:number):Graph {
        return this.graphs.list[enumId];
    }
    getDirection(enumId:number):Direction {
        return this.directions.list[enumId];
    }
    getGraphNode(enumId:number):GraphNode {
        return this.graphNodes.list[enumId];
    }
    getPlayer(enumId:number):Player {
        return this.players.list[enumId];
    }
    getPiece(enumId:number):Piece {
        return this.pieces.list[enumId];
    }
    getStack(enumId:number):Stack {
        return this.stacks.list[enumId];
    }
    getAttribute(enumId:number):Attribute {
        return this.attributes.list[enumId];
    }
}

export class Options {
    canPassOnTurn = false;
}

// Game gameStateDesc object.
// This is user facing code, use getters and underscored members:
export class GameStateDescriptor {
    enums = new Enumerators();
    turnOrder:Player[] = [];
    private _turnsCanPass:boolean = false;
    _initialState:GameState;
    private _shapeFinalized = false;

    constructor() {
         this._initialState = new GameState(this);
    }

    public direction(grid:Grid, dx:number, dy:number) {
        return grid.direction(dx, dy);
    }

    public _ensureNotFinalized() {
        if (this._shapeFinalized) {
            throw new Error("Cannot call after calling gameStateDesc.finalizeBoardShape()!");
        }
    }

    public _ensureFinalized(finalize = false) {
        if (!this._shapeFinalized) {
            if (!finalize) {
                throw new Error("Must call gameStateDesc.finalizeBoardShape() before proceeding!");
            }
            this.finalizeBoardShape();
        }
    }
    
    public finalizeBoardShape() {
        this._ensureNotFinalized();
        this._shapeFinalized = true;
        this._initialState._enumPieces = arrayWithValueNTimes(-1, this.enums.graphNodes.total());
        this._initialState._enumOwners = arrayWithValueNTimes(-1, this.enums.graphNodes.total());
        this._initialState._enumAttributes = arrayWithValueNTimes(0, this.enums.graphNodes.total());
    }

    public cellList() {
        return this.enums.graphNodes.list;
    }

    public boardSetup(piece:Piece, player:Player, cellIds:string[]):void {
        this._ensureFinalized(/* Finalize if necessary: */true);
        for (var cellId of cellIds) {
            var cell = this.getCell(cellId);
            this._initialState._enumPieces[cell.enumId] = piece.enumId;
            let defaultAttributes = 0;
            for (let attribute of piece.attributes) {
                if (attribute.defaultVal) {
                    defaultAttributes |= 1 << attribute.enumId; 
                }
            }
            this._initialState._enumAttributes[cell.enumId] = defaultAttributes;
            this._initialState._enumOwners[cell.enumId] = player.enumId;
        }
    }
    
    public stackSetup(stack:Stack, startAmount:number):void {
        this._ensureFinalized(/* Finalize if necessary: */true);
        this._initialState._enumStackAmounts[stack.enumId] = startAmount;
    }
    
    public attribute(piece:Piece, id:string, defaultVal:boolean) {
        this._ensureNotFinalized();
        piece.attribute(id, defaultVal);
    }
    public piece(id:string) {
        this._ensureNotFinalized();
        return new Piece(this, id);
    }
    
    public stack(id:string, player:Player, piece:Piece) {
        this._ensureNotFinalized();
        return new Stack(this, id, player, piece);
    }

    public player(id:string) {
        this._ensureNotFinalized();
        return new Player(this, id);
    }

    public grid(w:number, h:number, cellNameCallback: (x:number, y:number)=>string) {
        this._ensureNotFinalized();
        return new Grid(this, w, h, cellNameCallback);
    }

    public grids():Grid[] {
        var ret:Grid[] = [];
        for (var graph of this.enums.graphs.list) {
            if (graph instanceof Grid) ret.push(graph);
        }
        return ret;
    }

    // Mmm boilerplate.

    public getPlayers():Player[] {
        return this.enums.players.list;
    }
    
    public getPieces():Piece[] {
        return this.enums.pieces.list;
    }
    public getCell(id:string):GraphNode {
        for (var graph of this.enums.graphs.list) {
            var cell = graph.getById(id);
            if (cell != null) {
                return cell;
            }
        }
        throw new Error(`boarders.ts: Graph node "${id}" was not found. Is your graph node naming convention consistent?`);
    }


    public createGameState():GameState {
        let {_enumOwners, _enumPieces, _enumStackAmounts} = this._initialState;
        return new GameState(this, arrayCopy(_enumOwners), arrayCopy(_enumPieces), arrayCopy(_enumStackAmounts));
    }
}


