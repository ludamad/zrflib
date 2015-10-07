import {zrfNodes as zrf} from "./zrfTypes";
import * as stateTypes from "./stateTypes";
import {GameStateComponents} from "./rulesCompiler";
import {StrMap} from "./common/common";
import {zrfPrettyPrint} from "./zrfUtils";

const enum MoveType {
    SLIDE_MOVE,
    DROP_MOVE,
    CAPTURE_MOVE
};

export class MoveComponent {
    // For multipart moves:
    constructor(public kind:MoveType,
        public startNode:stateTypes.GraphNode,
        public endNode:stateTypes.GraphNode,
        public setFlags:number,
        public unsetFlags:number) {
    }
    clone() {
        return new MoveComponent(this.kind, this.startNode, this.endNode, this.setFlags, this.unsetFlags);
    }
    reinit(kind:MoveType, startNode:stateTypes.GraphNode, endNode:stateTypes.GraphNode, setFlags:number, unsetFlags:number) {
        this.kind = kind;
        this.startNode = startNode;
        this.endNode = endNode;
        this.setFlags = setFlags;
        this.unsetFlags = unsetFlags;
        return this;
    }
    serialize():string {
        if (this.kind !== 0) throw new Error("NYI")
        let str = `${this.startNode.id}-${this.endNode.id}`;
        return str;
    }
}

export class CompoundMove {
    _buffer:MoveComponent[] = [];
    _length = 0;
    add(kind:MoveType, startNode:stateTypes.GraphNode, endNode:stateTypes.GraphNode, setFlags:number, unsetFlags:number) {
        if (this._buffer.length > this._length) {
            this._buffer[this._length].reinit(kind, startNode, endNode, setFlags, unsetFlags);
        } else {
            this._buffer.push(new MoveComponent(kind, startNode, endNode, setFlags, unsetFlags));
        }
        this._length++;
    }
    addSlideMove(startNode:stateTypes.GraphNode, endNode:stateTypes.GraphNode, setFlags:number, unsetFlags:number) {
        this.add(MoveType.SLIDE_MOVE, startNode, endNode, setFlags, unsetFlags);
    }
    addCaptureMove(endNode:stateTypes.GraphNode) {
        this.add(MoveType.CAPTURE_MOVE, null, endNode, 0, 0);
    }
    get(i:number):MoveComponent {
        return this._buffer[i];
    }
    getMoves():MoveComponent[] {
        let moves:MoveComponent[] = [];
        for (let i = 0; i < this._length; i++) {
            moves.push(this._buffer[i].clone());
        }
        return moves;
    }
    length() {
        return this._length;
    }
    clear() {
        this._length = 0;
    }
    clone() {
        let ret = new CompoundMove();
        ret._length = this._length;
        for (let i = 0; i < this._length; i++) {
            ret._buffer.push(this._buffer[i]);
        }
        return ret;
    }
    serialize() {
        let moveParts = this.getMoves();
        if (moveParts.length === 0) return "NOTHING\nNOTHING\NOTHING";
        return moveParts.map(m => m.serialize()).join("+");
    }
}

export function doMoveComponent(gameState:stateTypes.GameState, move:MoveComponent) {
    switch (move.kind) {
        case MoveType.SLIDE_MOVE:
            gameState.movePiece(move.startNode, move.endNode)
            gameState._enumAttributes[move.startNode.enumId] |= move.setFlags;
            gameState._enumAttributes[move.startNode.enumId] &= ~(move.unsetFlags);
            return;
        case MoveType.CAPTURE_MOVE:
            return gameState.clearPiece(move.endNode);
    }
}
export function doMove(gameState:stateTypes.GameState, move:CompoundMove) {
    if (move.length() === 0) {
        throw new Error("Shouldnt be making empty moves!");
    }
    for (let i = 0; i < move.length(); i++) {
        doMoveComponent(gameState, move.get(i));
    }
    gameState.endTurn();
}

export class MoveList {
    _buffer:CompoundMove[] = [];
    _length:number = 0;
    pop() {
        if (this._length <= 0) throw new Error();
        this._length--;
    }
    postAdd(move:CompoundMove) {
        if (this._buffer[this._length] !== move) {
            throw new Error();
        }
        if (move._length === 0) {
            throw new Error("Empty move!")
        }
        this._length++;
    }
    add():CompoundMove {
        let ret = this.preAdd();
        this.postAdd(ret);
        return ret;
    }
    preAdd():CompoundMove {
        if (this._buffer.length <= this._length) {
            var move = new CompoundMove();
            this._buffer.push(move);
        } else {
            var move = this._buffer[this._length];
            move.clear();
        }
        return move;
    }
    length() {
        return this._length;
    }
    get(i:number) {
        return this._buffer[i];
    }
    clear() {
        this._length = 0;
    }
    print() {
        for (let i = 0; i < this._length; i++) {
            console.log(`${i}: ${this._buffer[i].serialize()}`);
        }
    }
}


abstract class ZrfInterpreterBase {
    stateDesc:stateTypes.GameStateDescriptor;
    enums:stateTypes.Enumerators;
    finished = false;
    currentNode:stateTypes.GraphNode;
    currentPlayer:stateTypes.Player;
    currentPiece:stateTypes.Piece;
    startNode:stateTypes.GraphNode;
    moveHistory:{lastFrom:stateTypes.GraphNode, lastTo:stateTypes.GraphNode};
    moveList:MoveList;
    currentMove:CompoundMove;
    setFlags = 0;
    unsetFlags = 0;

    constructor(public gameState:stateTypes.GameState, public compState:GameStateComponents) {
        this.stateDesc = gameState.gameStateDesc;
        this.enums = gameState.gameStateDesc.enums;
        this.moveHistory = {lastFrom:null, lastTo:null};
    }

    abstract eval(obj:zrf.Condition|zrf.Statement);
    // Must be called before 'eval':
    interpret(moveList:MoveList, currentNode:stateTypes.GraphNode, currentPlayer:stateTypes.Player, statements:zrf.Statement[]) {
        this.finished = false;
        this.moveList = moveList;
        this.startNode = this.currentNode = currentNode;
        this.currentPlayer = currentPlayer;
        this.currentMove = this.moveList.preAdd();
        this.currentPiece = this.gameState.getPiece(this.startNode);
        this.setFlags = this.unsetFlags = 0;
        for (let statement of statements) {
            this.eval(statement);
        }
    }
    updateMoveHistory(lastFrom:stateTypes.GraphNode, lastTo:stateTypes.GraphNode) {
        this.moveHistory.lastFrom = lastFrom;
        this.moveHistory.lastTo = lastTo;
    }
    finish() {
        this.finished = true;
        /* Be hygenic, so use-after-finish is easier to detect: */
        // this.startNode = this.currentNode = null;
        this.currentPlayer = null;
    }
    getDirection(id:string) : stateTypes.Direction {
        return this.compState.idToDirection[id].getSymmetry(this.currentPlayer);
    }
    getNode(posOrDirId:string):stateTypes.GraphNode {
        var dirOrNode = this.getDirection(posOrDirId) || this.compState.idToGraphNode[posOrDirId];
        if (dirOrNode instanceof stateTypes.Direction) {
            return this.enums.getGraphNode(dirOrNode._next[this.currentNode.enumId]);
        } else {
            return <stateTypes.GraphNode> dirOrNode;
        }
    }

    getLocation(obj:{positionOrDirectionId: string}):stateTypes.GraphNode {
        if (typeof obj.positionOrDirectionId === "undefined") {
            return this.currentNode;
        }
        return this.getNode(obj.positionOrDirectionId);
    }
}

// Interprets the imperative move generation language:
export class ZrfInterpreter extends ZrfInterpreterBase {
    eval(obj:zrf.Condition|zrf.Statement|zrf.Statement[]):boolean {
        if (Array.isArray(obj)) {
            for (let statement of obj) {
                this.eval(statement);
            }
        } else {
            if (this.finished) {
                return false;
            }
            if (this[obj._classname] === undefined) {
                console.log(`** NYI no method for "${obj._classname}"`);
                return false;
            }
            var value = this[obj._classname](obj);
            return (obj instanceof zrf.Condition && obj.negated) ? !value : value;
        }
    }
    SetAttributeStatement(obj:zrf.SetAttributeStatement) {
        let attributes = this.compState.pieceAttributes.get(this.currentPiece);
        let attribute:stateTypes.Attribute = attributes[obj.attributeId];
        let value:boolean = this.eval(obj.value);
        if (value) {
            this.setFlags |= 1 << attribute.enumId;
        } else {
            this.unsetFlags &= ~(1 << attribute.enumId);
        }
        
    }
    AddStatement(obj: zrf.AddStatement) {
        this.currentMove.addSlideMove(this.startNode, this.currentNode, this.setFlags, this.unsetFlags);
        this.moveList.postAdd(this.currentMove);
        this.currentMove = this.moveList.preAdd();
    }
    BackStatement(obj: zrf.BackStatement) {
        console.log("** NYI " + obj._classname);
    }
    ElseStatement(obj: zrf.ElseStatement) {
        console.log("** NYI " + obj._classname);
    }
    CascadeStatement(obj: zrf.CascadeStatement) {
        console.log("** NYI " + obj._classname);
    }
    StepDirectionStatement(obj: zrf.StepDirectionStatement) {
        let dir = this.getDirection(obj.directionId);
        this.currentNode = dir.next(this.currentNode);
        if (!this.currentNode) {
            this.finish();
        }
    }
    CaptureStatement(obj: zrf.CaptureStatement) {
        let node:stateTypes.GraphNode = this.getLocation(obj);
        if (!node) return;
        this.currentMove.addCaptureMove(node);
    }
    ChangeOwnerStatement(obj: zrf.ChangeOwnerStatement) {
        console.log("** NYI " + obj._classname);
        obj.positionOrDirectionId; // string
    }
    ChangeTypeStatement(obj: zrf.ChangeTypeStatement) {
        console.log("** NYI " + obj._classname);
        obj.pieceId; // string
        obj.positionOrDirectionId; // string
    }
    CreateStatement(obj: zrf.CreateStatement) {
        console.log("** NYI " + obj._classname);
        obj.playerId; // string
        obj.pieceId; // string
        obj.positionOrDirectionId; // string
    }
    FlipStatement(obj: zrf.FlipStatement) {
        console.log("** NYI " + obj._classname);
    }
    GoStatement(obj: zrf.GoStatement) {
        console.log("** NYI " + obj._classname);
        obj.where; // string
    }
    VerifyStatement(obj: zrf.VerifyStatement) {
        if (!this.eval(obj.condition)) {
            this.finish();
        }
    }
    IfStatement(obj: zrf.IfStatement) {
        if (this.eval(obj.condition)) {
            this.eval(obj.ifTrueStatements);
        } else {
            this.eval(obj.ifFalseStatements);
        }
    }
    WhileStatement(obj: zrf.WhileStatement) {
        while (this.eval(obj.condition)) {
            this.eval(obj.statements);
        }
    }
    MarkStatement(obj: zrf.MarkStatement) {
        console.log("** NYI " + obj._classname);
        obj.positionOrDirectionId; // string
    }
    // Conditions:
    LiteralCondition(obj: zrf.LiteralCondition) {
        return obj.value.toString();
    }
    NotCondition(obj: zrf.NotCondition) {
        return `(!${this.eval(obj.condition)})`;
    }
    FlagCondition(obj: zrf.FlagCondition) {
        return `TODOflagCondition("${obj.flagName}")`;
    }
    AndCondition(obj: zrf.AndCondition) {
        let andedTogether = obj.conditions.map(c => this.eval(c)).join(" && ");
        return `(${andedTogether})`;
    }
    OrCondition(obj: zrf.OrCondition) {
        let oredTogether = obj.conditions.map(c => this.eval(c)).join(" || ");
        return `(${oredTogether})`;
    }
    AdjacentToEnemyCondition(obj: zrf.AdjacentToEnemyCondition) {
        // let dirOrNode:stateTypes.Direction|stateTypes.GraphNode = this.getDirectionOrNode(obj.positionOrDirectionId);
        // if (dirOrNode instanceof stateTypes.Direction) {
        //     dirOrNode.enumId;
        // }
        // obj.positionOrDirectionId
        console.log("** NYI " + obj._classname);
    }
    AttackedCondition(obj: zrf.AttackedCondition) {
        console.log("** NYI " + obj._classname);
    }
    DefendedCondition(obj: zrf.DefendedCondition) {
        console.log("** NYI " + obj._classname);
    }
    EmptyCondition(obj: zrf.EmptyCondition) {
        let node:stateTypes.GraphNode = this.getLocation(obj);
        if (!node) return false;
        return !this.gameState.hasPiece(node);
    }
    EnemyCondition(obj: zrf.EnemyCondition) {
        let node:stateTypes.GraphNode = this.getLocation(obj);
        if (!node) return false;
        return (this.gameState.hasPiece(node) && this.gameState.getPieceOwner(node) !== this.currentPlayer);
    }
    FriendCondition(obj: zrf.FriendCondition) {
        let node:stateTypes.GraphNode = this.getLocation(obj);
        if (!node) return false;
        return this.gameState.hasPiece(node) && this.gameState.getPieceOwner(node) === this.currentPlayer;
    }
    GoalPositionCondition(obj: zrf.GoalPositionCondition) {
        console.log("** NYI " + obj._classname);
    }
    IncludesCondition(obj: zrf.IncludesCondition) {
        console.log("** NYI " + obj._classname);
    }
    InZoneCondition(obj: zrf.InZoneCondition) {
        let zone = this.compState.idToZone[obj.zoneId];
        let node:stateTypes.GraphNode = this.getLocation(obj);
        if (!node) return false;
        return zone.inZone(this.currentPlayer, node);
    }
    LastFromCondition(obj: zrf.LastFromCondition) {
        return this.getLocation(obj) === this.moveHistory.lastFrom;
    }
    LastToCondition(obj: zrf.LastToCondition) {
        return this.getLocation(obj) === this.moveHistory.lastTo;
    }
    MarkedCondition(obj: zrf.MarkedCondition) {
        console.log("** NYI " + obj._classname);
    }
    StalematedCondition(obj: zrf.StalematedCondition) {
        console.log("** NYI " + obj._classname);
    }
    NeutralCondition(obj: zrf.NeutralCondition) {
        console.log("** NYI " + obj._classname);
    }
    OnBoardCondition(obj: zrf.OnBoardCondition) {
        console.log("** NYI " + obj._classname);
    }
    PieceCondition(obj: zrf.PieceCondition) {
        let piece = this.compState.idToPiece[obj.pieceId];
        let node = this.currentNode;//this.getLocation(obj);
        if (!node) return false;
        return (this.gameState.getPiece(node) === piece);
    }
    PositionCondition(obj: zrf.PositionCondition) {
        console.log("** NYI " + obj._classname);
    }
    PositionFlagCondition(obj: zrf.PositionFlagCondition) {
        console.log("** NYI " + obj._classname);
    }
    AbsoluteConfigCondition(obj: zrf.AbsoluteConfigCondition) {
        console.log("** NYI " + obj._classname);
    }
    RelativeConfigCondition(obj: zrf.RelativeConfigCondition) {
        console.log("** NYI " + obj._classname);
    }
}
